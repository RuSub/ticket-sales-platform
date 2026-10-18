import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { Injectable } from '@nestjs/common';

@Injectable()
export class QRCodeService {
  async generate(ticketId: string, eventData: any) {
    const qrData = JSON.stringify({
      ticketId,
      eventId: eventData.id,
      eventName: eventData.title,
      eventDate: eventData.eventDate,
      venue: eventData.venueName,
      seats: eventData.seats?.map((s: any) => ({
        row: s.rowNumber,
        seat: s.seatNumber,
        category: s.category?.name,
        price: s.category?.price,
      })) || [],
      buyer: eventData.buyer?.email,
      generatedAt: new Date().toISOString(),
    });

    const pngBuffer = await QRCode.toBuffer(qrData);
    return { qrData, pngBuffer };
  }

  async generateTicketPDF(ticketId: string, eventData: any, seats: any[], user: any): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

    doc.fontSize(24).text('Ticket', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(eventData.title, { align: 'center' });
    doc.fontSize(12).text(`Date: ${new Date(eventData.eventDate).toLocaleString()}`, { align: 'center' });
    doc.text(`Venue: ${eventData.venueName || 'TBD'}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text('Seats:', { underline: true });
    seats.forEach((seat: any) => {
      doc.fontSize(11).text(
        `Row ${seat.rowNumber}, Seat ${seat.seatNumber} — ${seat.category?.name || 'Standard'} — $${seat.category?.price || 0}`,
      );
    });

    doc.moveDown();
    doc.fontSize(11).text(`Buyer: ${user?.fullName || user?.email || 'Anonymous'}`);
    doc.text(`Ticket ID: ${ticketId}`);
    doc.text(`Order Date: ${new Date().toLocaleString()}`);

    doc.moveDown();
    doc.fontSize(9).text('Scan the QR code below for verification', { align: 'center' });

    // QR code
    const { pngBuffer } = await this.generate(ticketId, {
      id: eventData.id,
      title: eventData.title,
      eventDate: eventData.eventDate,
      venueName: eventData.venueName,
      seats,
      buyer: user,
    });

    doc.image(pngBuffer, { fit: [150, 150], align: 'center', valign: 'center' });

    doc.end();

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }
}
