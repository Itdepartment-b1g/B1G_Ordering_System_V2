import { supabase } from './supabase';

interface OrderEmailData {
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  orderDate: string;
  items: Array<{
    brandName: string;
    variantName: string;
    variantType: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string;
  signatureUrl?: string;
  // Optional: agent contact info for support
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  // Optional: leader info and payment info for IT receipt
  leaderName?: string;
  paymentMethod?: string;
  paymentProofUrl?: string;
  // Sales invoice request
  requestSalesInvoice?: boolean;
}

// Generate HTML email from order data for client
function generateEmailHTML(orderData: OrderEmailData): string {
  const itemsHTML = orderData.items.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; color: #374151;">${item.brandName} - ${item.variantName}</td>
      <td style="padding: 12px; color: #374151; text-align: center;">${item.variantType}</td>
      <td style="padding: 12px; color: #374151; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; color: #374151; text-align: right;">₱${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 12px; color: #374151; text-align: right; font-weight: 600;">₱${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px; background-color: #1f2937; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">B1G Corporation</h1>
                            <p style="margin: 8px 0 0; color: #d1d5db; font-size: 14px;">Order Confirmation</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px;">
                            <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; line-height: 1.6;">Dear ${orderData.clientName},</p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">Thank you for your order with B1G Corporation. Your order has been received and is pending approval.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; padding: 20px;">
                                <tr>
                                    <td>
                                        <table role="presentation" style="width: 100%;">
                                            <tr>
                                                <td style="padding-bottom: 12px;">
                                                    <span style="color: #6b7280; font-size: 14px;">Order Number:</span><br>
                                                    <span style="color: #111827; font-size: 18px; font-weight: 600;">${orderData.orderNumber}</span>
                                                </td>
                                                <td align="right" style="padding-bottom: 12px;">
                                                    <span style="color: #6b7280; font-size: 14px;">Order Date:</span><br>
                                                    <span style="color: #111827; font-size: 14px; font-weight: 500;">${new Date(orderData.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">Order Items</h2>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <thead>
                                    <tr style="background-color: #f9fafb;">
                                        <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 14px; font-weight: 600;">Product</th>
                                        <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 14px; font-weight: 600;">Type</th>
                                        <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 14px; font-weight: 600;">Qty</th>
                                        <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px; font-weight: 600;">Unit Price</th>
                                        <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px; font-weight: 600;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${itemsHTML}</tbody>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td align="right">
                                        <table role="presentation" style="margin-left: auto; width: 300px;">
                                            <tr>
                                                <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right; width: 60%;">Subtotal:</td>
                                                <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right; width: 40%; font-weight: 500;">₱${orderData.subtotal.toFixed(2)}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right;">Tax:</td>
                                                <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">₱${orderData.tax.toFixed(2)}</td>
                                            </tr>
                                            ${orderData.discount > 0 ? `
                                            <tr>
                                                <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right;">Discount:</td>
                                                <td style="padding: 4px 0; color: #10b981; font-size: 14px; text-align: right; font-weight: 500;">- ₱${orderData.discount.toFixed(2)}</td>
                                            </tr>
                                            ` : ''}
                                            <tr style="border-top: 2px solid #e5e7eb;">
                                                <td style="padding: 12px 0 0; color: #111827; font-size: 18px; font-weight: 700; text-align: right;">Total Amount:</td>
                                                <td style="padding: 12px 0 0; color: #111827; font-size: 18px; font-weight: 700; text-align: right;">₱${orderData.total.toFixed(2)}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    ${orderData.notes ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Notes:</p>
                                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">${orderData.notes}</p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.requestSalesInvoice ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600;">📄 Sales Invoice Requested</p>
                                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">A sales invoice has been requested for this order. The invoice will be processed and sent separately.</p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.signatureUrl ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                                <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; font-weight: 600;">Client Signature:</p>
                                <div style="background-color: #ffffff; border: 1px solid #d1d5db; border-radius: 4px; padding: 16px; text-align: center;">
                                    <img src="${orderData.signatureUrl}" alt="Client Signature" style="max-width: 100%; height: auto; border-radius: 4px;" />
                                </div>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.agentName || orderData.agentEmail || orderData.agentPhone ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Need help with your order?</p>
                                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
                                  Your sales agent ${orderData.agentName ? `<strong>${orderData.agentName}</strong>` : ''}${orderData.agentEmail || orderData.agentPhone ? ' can be reached at ' : ''}
                                  ${orderData.agentEmail ? `<a href="mailto:${orderData.agentEmail}" style="color:#2563eb; text-decoration:none;">${orderData.agentEmail}</a>` : ''}
                                  ${orderData.agentEmail && orderData.agentPhone ? ' · ' : ''}
                                  ${orderData.agentPhone ? `<a href="tel:${orderData.agentPhone}" style="color:#2563eb; text-decoration:none;">${orderData.agentPhone}</a>` : ''}
                                  .
                                </p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px; line-height: 1.6;"><strong>Status:</strong> Pending Approval</p>
                            <p style="margin: 16px 0 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">This is an automated confirmation email. Your order will be processed once approved.<br>We will notify you once your order has been approved.</p>
                            <p style="margin: 24px 0 0; color: #d1d5db; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} B1G Corporation. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
}

// Generate HTML email for IT department (order receipt/confirmation)
function generateITReceiptHTML(orderData: OrderEmailData): string {
  const itemsHTML = orderData.items.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; color: #374151;">${item.brandName} - ${item.variantName}</td>
      <td style="padding: 12px; color: #374151; text-align: center;">${item.variantType}</td>
      <td style="padding: 12px; color: #374151; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; color: #374151; text-align: right;">₱${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 12px; color: #374151; text-align: right; font-weight: 600;">₱${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Receipt - ${orderData.orderNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px; background-color: #1f2937; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">B1G Corporation</h1>
                            <p style="margin: 8px 0 0; color: #d1d5db; font-size: 14px;">Order Receipt - Internal Confirmation</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px;">
                            <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">A new order has been created and requires confirmation.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; padding: 20px;">
                                <tr>
                                    <td>
                                        <table role="presentation" style="width: 100%;">
                                            <tr>
                                                <td style="padding-bottom: 12px;">
                                                    <span style="color: #6b7280; font-size: 14px;">Order Number:</span><br>
                                                    <span style="color: #111827; font-size: 18px; font-weight: 600;">${orderData.orderNumber}</span>
                                                </td>
                                                <td align="right" style="padding-bottom: 12px;">
                                                    <span style="color: #6b7280; font-size: 14px;">Order Date:</span><br>
                                                    <span style="color: #111827; font-size: 14px; font-weight: 500;">${new Date(orderData.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td colspan="2" style="padding-top: 12px; border-top: 1px solid #e5e7eb;">
                                                    <span style="color: #6b7280; font-size: 14px;">Client:</span><br>
                                                    <span style="color: #111827; font-size: 16px; font-weight: 600;">${orderData.clientName}</span><br>
                                                    <span style="color: #6b7280; font-size: 13px;">${orderData.clientEmail}</span>
                                                </td>
                                            </tr>
                                            ${orderData.agentName ? `
                                            <tr>
                                                <td colspan="2" style="padding-top: 12px;">
                                                    <span style="color: #6b7280; font-size: 14px;">Sales Agent:</span><br>
                                                    <span style="color: #111827; font-size: 14px; font-weight: 500;">${orderData.agentName}</span>
                                                    ${orderData.agentEmail ? `<br><span style="color: #6b7280; font-size: 13px;">${orderData.agentEmail}</span>` : ''}
                                                    ${orderData.agentPhone ? `<br><span style="color: #6b7280; font-size: 13px;">${orderData.agentPhone}</span>` : ''}
                                                </td>
                                            </tr>
                                            ` : ''}
                                            ${orderData.leaderName ? `
                                            <tr>
                                                <td colspan="2" style="padding-top: 12px;">
                                                    <span style="color: #6b7280; font-size: 14px;">Leader:</span><br>
                                                    <span style="color: #111827; font-size: 14px; font-weight: 500;">${orderData.leaderName}</span>
                                                </td>
                                            </tr>
                                            ` : ''}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">Order Items</h2>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <thead>
                                    <tr style="background-color: #f9fafb;">
                                        <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 14px; font-weight: 600;">Product</th>
                                        <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 14px; font-weight: 600;">Type</th>
                                        <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 14px; font-weight: 600;">Qty</th>
                                        <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px; font-weight: 600;">Unit Price</th>
                                        <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px; font-weight: 600;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${itemsHTML}</tbody>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td align="right">
                                        <table role="presentation" style="margin-left: auto; width: 300px;">
                                            <tr>
                                                <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right; width: 60%;">Subtotal:</td>
                                                <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right; width: 40%; font-weight: 500;">₱${orderData.subtotal.toFixed(2)}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right;">Tax:</td>
                                                <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">₱${orderData.tax.toFixed(2)}</td>
                                            </tr>
                                            ${orderData.discount > 0 ? `
                                            <tr>
                                                <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right;">Discount:</td>
                                                <td style="padding: 4px 0; color: #10b981; font-size: 14px; text-align: right; font-weight: 500;">- ₱${orderData.discount.toFixed(2)}</td>
                                            </tr>
                                            ` : ''}
                                            <tr style="border-top: 2px solid #e5e7eb;">
                                                <td style="padding: 12px 0 0; color: #111827; font-size: 18px; font-weight: 700; text-align: right;">Total Amount:</td>
                                                <td style="padding: 12px 0 0; color: #111827; font-size: 18px; font-weight: 700; text-align: right;">₱${orderData.total.toFixed(2)}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    ${orderData.notes ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Notes:</p>
                                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">${orderData.notes}</p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.requestSalesInvoice ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600;">📄 Sales Invoice Requested</p>
                                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">A sales invoice has been requested for this order. Please process and send the invoice to the client.</p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.paymentMethod && orderData.paymentProofUrl ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Payment Method:</p>
                                <p style="margin: 0 0 16px; color: #374151; font-size: 16px; font-weight: 600;">${orderData.paymentMethod}</p>
                                <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; font-weight: 600;">Payment Proof:</p>
                                <div style="background-color: #ffffff; border: 1px solid #d1d5db; border-radius: 4px; padding: 16px; text-align: center;">
                                    <img src="${orderData.paymentProofUrl}" alt="Payment Proof" style="max-width: 100%; max-height: 400px; height: auto; border-radius: 4px; object-fit: contain;" />
                                </div>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.signatureUrl ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                                <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; font-weight: 600;">Client Signature:</p>
                                <div style="background-color: #ffffff; border: 1px solid #d1d5db; border-radius: 4px; padding: 16px; text-align: center;">
                                    <img src="${orderData.signatureUrl}" alt="Client Signature" style="max-width: 100%; height: auto; border-radius: 4px;" />
                                </div>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px; line-height: 1.6;"><strong>Status:</strong> Pending Approval</p>
                            <p style="margin: 16px 0 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">This is an automated order receipt for internal confirmation purposes.</p>
                            <p style="margin: 24px 0 0; color: #d1d5db; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} B1G Corporation. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
}

export async function sendOrderConfirmationEmail(data: OrderEmailData) {
  try {
    console.log('📧 Sending order confirmation email to:', data.clientEmail);

    const htmlContent = generateEmailHTML(data);
    const itReceiptContent = generateITReceiptHTML(data);

    // Determine API URL - Vercel automatically serves API routes from the same domain
    const apiUrl = `${window.location.origin}/api/send-email`;

    console.log('🚀 Using email API URL:', apiUrl);

    // Send email to client
    const clientResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: data.clientEmail,
        subject: `Order Confirmation - ${data.orderNumber}`,
        html: htmlContent,
      }),
    });

    if (!clientResponse.ok) {
      const errorData = await clientResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ Email API error for client:', errorData);
      throw new Error(errorData.error || `Failed to send email: ${clientResponse.status} ${clientResponse.statusText}`);
    }

    const clientResult = await clientResponse.json();
    console.log('✅ Email sent successfully to client:', clientResult);

    // Send receipt email to IT department
    try {
      const itResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'financedepartment.b1g@gmail.com',
          subject: `Order Receipt - ${data.orderNumber} - ${data.clientName}`,
          html: itReceiptContent,
        }),
      });

      if (!itResponse.ok) {
        const errorData = await itResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('⚠️ Failed to send receipt email to IT department:', errorData);
        // Don't throw error - client email was sent successfully
      } else {
        const itResult = await itResponse.json();
        console.log('✅ Receipt email sent successfully to IT department:', itResult);
      }
    } catch (itError) {
      console.error('⚠️ Error sending receipt email to IT department (non-critical):', itError);
      // Don't throw error - client email was sent successfully
    }

    return clientResult;
  } catch (error) {
    console.error('Failed to send order confirmation email:', error);
    throw error;
  }
}

