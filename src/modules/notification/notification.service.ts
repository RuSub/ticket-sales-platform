import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendEmail(to: string, subject: string, html: string) {
    this.logger.log(`Email would be sent to ${to}: ${subject}`);
    return { success: true };
  }

  async sendTicketEmail(to: string, ticketData: any) {
    return this.sendEmail(
      to,
      `Your ticket for ${ticketData.eventName}`,
      `<p>Thank you for your purchase!</p><p>Ticket ID: ${ticketData.ticketId}</p>`,
    );
  }

  async sendReservationEmail(to: string, eventName: string) {
    return this.sendEmail(
      to,
      'Seats reserved for 10 minutes',
      `<p>Your seats for ${eventName} are reserved. Complete payment to confirm.</p>`,
    );
  }

  async sendTimeoutEmail(to: string, eventName: string) {
    return this.sendEmail(
      to,
      'Reservation expired',
      `<p>Your reservation for ${eventName} has expired.</p>`,
    );
  }

  async sendPaymentEmail(to: string, eventName: string) {
    return this.sendEmail(
      to,
      'Payment confirmed. Your ticket is ready.',
      `<p>Payment confirmed for ${eventName}. Your ticket is ready.</p>`,
    );
  }

  async sendReturnEmail(to: string, status: string) {
    return this.sendEmail(
      to,
      `Return ${status}`,
      `<p>Your return has been ${status.toLowerCase()}.</p>`,
    );
  }
}
