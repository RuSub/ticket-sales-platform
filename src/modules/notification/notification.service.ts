import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from '../../prisma/prisma.service';
import { EmailTemplates } from '../../common/email/email.templates';
import { QRCodeService } from '../../common/qr/qr.service';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 60_000;

type SendInput = {
  dedupeKey: string;
  template: string;
  to: string;
  subject: string;
  body?: string;
  orderId?: string;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transport: Transporter;

  constructor(private readonly qrCodeService: QRCodeService) {
    this.transport = this.createTransport();
  }

  /**
   * Idempotent send: the delivery row is created (or reused) by dedupeKey,
   * then a single delivery attempt is made. Failures stay PENDING and are
   * retried by NotificationRetryService with exponential backoff.
   */
  async send(input: SendInput) {
    const delivery = await prisma.notificationDelivery.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: {
        dedupeKey: input.dedupeKey,
        template: input.template,
        recipient: input.to,
        subject: input.subject,
        body: input.body,
        orderId: input.orderId,
      },
    });

    if (delivery.status === 'SENT' || delivery.status === 'FAILED') {
      return delivery;
    }

    return this.attemptDelivery(delivery.id);
  }

  async attemptDelivery(deliveryId: string, force = false) {
    const delivery = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery || delivery.status === 'SENT' || delivery.status === 'FAILED') {
      return delivery;
    }
    if (!force && delivery.nextAttemptAt && delivery.nextAttemptAt > new Date()) {
      return delivery;
    }

    try {
      if (process.env.SMTP_FORCE_FAIL === 'true') {
        throw new Error('SMTP failure (forced)');
      }
      const message = await this.buildMessage(delivery);
      await this.transport.sendMail(message);

      return prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          nextAttemptAt: null,
        },
      });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : String(error);
      const nextAttemptAt = failed
        ? null
        : new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (attempts - 1));

      this.logger.warn(
        `Delivery ${deliveryId} attempt ${attempts} failed: ${message}${failed ? ' (giving up)' : ''}`,
      );

      return prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts,
          status: failed ? 'FAILED' : 'PENDING',
          lastError: message,
          nextAttemptAt,
        },
      });
    }
  }

  async sendTicketEmail(
    to: string,
    ticketData: { ticketId: string; eventName: string; orderId?: string },
  ) {
    const orderId = ticketData.orderId ?? ticketData.ticketId;

    return this.send({
      dedupeKey: `ticket:${orderId}`,
      template: 'ticket',
      to,
      subject: `Ваш билет на ${ticketData.eventName}`,
      orderId,
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    return this.send({
      dedupeKey: `generic:${randomUUID()}`,
      template: 'generic',
      to,
      subject,
      body: html,
    });
  }

  async sendReservationEmail(to: string, eventName: string) {
    return this.sendEmail(
      to,
      'Места зарезервированы на 10 минут',
      `<p>Ваши места на «${eventName}» зарезервированы. Оплатите заказ в течение 10 минут.</p>`,
    );
  }

  async sendTimeoutEmail(to: string, eventName: string) {
    return this.sendEmail(
      to,
      'Резервирование истекло',
      `<p>Резервирование на «${eventName}» истекло, места возвращены в продажу.</p>`,
    );
  }

  async sendPaymentEmail(to: string, eventName: string) {
    return this.sendEmail(
      to,
      'Оплата подтверждена. Ваш билет готов.',
      `<p>Оплата по заказу на «${eventName}» подтверждена. Билет во вложении.</p>`,
    );
  }

  async sendReturnEmail(to: string, status: string) {
    return this.sendEmail(
      to,
      `Возврат: ${status}`,
      `<p>Статус вашего возврата: ${status}.</p>`,
    );
  }

  private createTransport(): Transporter {
    const mode = process.env.SMTP_MODE ?? 'smtp';

    if (mode === 'json') {
      return nodemailer.createTransport({ jsonTransport: true });
    }
    if (mode === 'fail') {
      return {
        sendMail: async () => {
          throw new Error('SMTP failure (test mode)');
        },
      } as unknown as Transporter;
    }

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  private async buildMessage(delivery: {
    template: string;
    recipient: string;
    subject: string;
    body: string | null;
    orderId: string | null;
  }) {
    const from = process.env.SMTP_FROM ?? 'tickets@ticket-platform.local';

    if (delivery.template === 'ticket' && delivery.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: delivery.orderId },
        include: {
          event: true,
          buyer: true,
          items: { include: { seat: { include: { category: true } } } },
        },
      });
      if (!order) {
        throw new Error(`Order ${delivery.orderId} not found for ticket delivery`);
      }

      const seats = order.items.map((item) => item.seat);
      const ticketId = order.ticketId ?? order.id;
      const pdf = await this.qrCodeService.generateTicketPDF(
        ticketId,
        order.event,
        seats,
        order.buyer,
      );

      return {
        from,
        to: delivery.recipient,
        subject: delivery.subject,
        html:
          delivery.body ??
          EmailTemplates.ticket({
            ticketId: order.id,
            eventName: order.event.title,
            eventDate: order.event.eventDate,
            venueName: order.event.venueName,
            seats,
            totalAmount: order.totalAmount,
          }),
        attachments: [
          {
            filename: `ticket-${ticketId}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      };
    }

    return {
      from,
      to: delivery.recipient,
      subject: delivery.subject,
      html: delivery.body ?? '<p></p>',
    };
  }
}
