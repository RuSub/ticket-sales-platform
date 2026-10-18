export const EmailTemplates = {
  ticket: (ticketData: any) => `
    <h1>Your Ticket for ${ticketData.eventName}</h1>
    <p>Thank you for your purchase!</p>
    <p><strong>Ticket ID:</strong> ${ticketData.ticketId}</p>
    <p><strong>Event:</strong> ${ticketData.eventName}</p>
    <p><strong>Date:</strong> ${new Date(ticketData.eventDate).toLocaleString()}</p>
    <p><strong>Venue:</strong> ${ticketData.venueName}</p>
    <p><strong>Seats:</strong> ${ticketData.seats?.map((s: any) => `Row ${s.rowNumber}, Seat ${s.seatNumber}`).join(', ')}</p>
    <p><strong>Price:</strong> $${ticketData.totalAmount}</p>
    <p>Please present this ticket (or the QR code below) at the venue entrance.</p>
  `,

  reservation: (data: any) => `
    <h1>Seats Reserved</h1>
    <p>Your seats for <strong>${data.eventName}</strong> are reserved for 10 minutes.</p>
    <p><strong>Seats:</strong> ${data.seats?.join(', ')}</p>
    <p><strong>Expires:</strong> ${new Date(data.expiresAt).toLocaleString()}</p>
    <p><a href="${data.paymentLink}">Complete Payment</a></p>
  `,

  timeout: (data: any) => `
    <h1>Reservation Expired</h1>
    <p>Your reservation for <strong>${data.eventName}</strong> has expired.</p>
    <p>Please select new seats if you still want to attend.</p>
  `,

  payment: (data: any) => `
    <h1>Payment Confirmed</h1>
    <p>Payment confirmed for <strong>${data.eventName}</strong>.</p>
    <p>Your ticket is ready. Check your email for the ticket with QR code.</p>
  `,

  returnApproved: (data: any) => `
    <h1>Return Approved</h1>
    <p>Your return for <strong>${data.eventName}</strong> has been approved.</p>
    <p>Refund amount: $${data.amount}</p>
    <p>Funds will be returned to your original payment method within 3-5 business days.</p>
  `,

  returnRejected: (data: any) => `
    <h1>Return Rejected</h1>
    <p>Your return request for <strong>${data.eventName}</strong> has been rejected.</p>
    <p>Reason: ${data.reason || 'Not specified'}</p>
  `,
};
