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
    pricingStrategy?: string;
    // Sales invoice request
    requestSalesInvoice?: boolean;
    // Company ID for fetching super admin and finance emails
    companyId?: string;
}

// Generate HTML email from order data for client
function generateEmailHTML(orderData: OrderEmailData): string {
    const itemsHTML = orderData.items.map((item, index) => `
    <tr style="border-bottom: 1px solid #f3f4f6; background-color: ${index % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding: 16px 12px; color: #1f2937; font-size: 14px; line-height: 1.5;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 2px;">${item.brandName}</div>
        <div style="font-size: 13px; color: #6b7280;">${item.variantName}</div>
      </td>
      <td style="padding: 16px 12px; color: #6b7280; text-align: center; font-size: 13px;">${item.variantType}</td>
      <td style="padding: 16px 12px; color: #1f2937; text-align: center; font-size: 14px; font-weight: 600;">×${item.quantity}</td>
      <td style="padding: 16px 12px; color: #6b7280; text-align: right; font-size: 14px;">₱${item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding: 16px 12px; color: #111827; text-align: right; font-size: 15px; font-weight: 700;">₱${item.total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation - B1G Corporation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%); line-height: 1.6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 48px 40px; text-align: center; border-bottom: 4px solid #3b82f6;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; text-transform: uppercase;">B1G Corporation</h1>
                            <p style="margin: 12px 0 0; color: #cbd5e1; font-size: 16px; font-weight: 500; letter-spacing: 0.5px;">Order Confirmation</p>
                        </td>
                    </tr>

                    <!-- Success Badge -->
                    <tr>
                        <td style="padding: 32px 40px 24px; text-align: center; background-color: #f8fafc;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 12px 28px; border-radius: 50px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                                ✓ ORDER RECEIVED
                            </div>
                        </td>
                    </tr>

                    <!-- Greeting -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <p style="margin: 0 0 12px; color: #64748b; font-size: 15px;">Dear <strong style="color: #1e293b;">${orderData.clientName}</strong>,</p>
                            <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.7;">Thank you for your order with B1G Corporation. We've received your request and it is currently <strong style="color: #3b82f6;">pending approval</strong>. You will be notified once your order has been processed.</p>
                        </td>
                    </tr>

                    <!-- Payment Info -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; padding: 20px 24px; border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; color: #1e40af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Payment Information</p>
                                <p style="margin: 0; font-size: 16px; color: #1e3a8a; font-weight: 700;">
                                    ${orderData.paymentMethod === 'GCASH' ? '💳 GCash' : orderData.paymentMethod === 'BANK_TRANSFER' ? '🏦 Bank Transfer' : orderData.paymentMethod === 'CHEQUE' ? '📝 Cheque' : '💵 Cash'}
                                </p>
                            </div>
                        </td>
                    </tr>
                    <!-- Order Details Card -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <table role="presentation" style="width: 100%; background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%); border-radius: 12px; border: 1px solid #e5e7eb; padding: 24px;">
                                <tr>
                                    <td style="width: 50%; padding-right: 12px;">
                                        <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</p>
                                        <p style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">${orderData.orderNumber}</p>
                                    </td>
                                    <td align="right" style="width: 50%; padding-left: 12px;">
                                        <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Order Date</p>
                                        <p style="margin: 0; color: #0f172a; font-size: 16px; font-weight: 600;">${new Date(orderData.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Order Items -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <h2 style="margin: 0 0 20px; color: #0f172a; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Order Items</h2>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
                                <thead>
                                    <tr style="background: linear-gradient(to right, #f8fafc 0%, #f1f5f9 100%);">
                                        <th style="padding: 16px 12px; text-align: left; color: #475569; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Product</th>
                                        <th style="padding: 16px 12px; text-align: center; color: #475569; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Type</th>
                                        <th style="padding: 16px 12px; text-align: center; color: #475569; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Qty</th>
                                        <th style="padding: 16px 12px; text-align: right; color: #475569; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Price</th>
                                        <th style="padding: 16px 12px; text-align: right; color: #475569; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${itemsHTML}</tbody>
                            </table>
                        </td>
                    </tr>

                    <!-- Price Summary -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <table role="presentation" style="width: 100%; background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%); border-radius: 12px; border: 1px solid #e5e7eb; padding: 28px;">
                                <tr>
                                    <td>
                                        <table role="presentation" style="width: 100%;">
                                            <tr>
                                                <td style="padding: 10px 0; color: #64748b; font-size: 15px; text-align: left;">Subtotal</td>
                                                <td style="padding: 10px 0; color: #1e293b; font-size: 15px; text-align: right; font-weight: 600;">₱${orderData.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 10px 0; color: #64748b; font-size: 15px; text-align: left;">Tax (VAT)</td>
                                                <td style="padding: 10px 0; color: #1e293b; font-size: 15px; text-align: right; font-weight: 600;">₱${orderData.tax.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                            ${orderData.discount > 0 ? `
                                            <tr>
                                                <td style="padding: 10px 0; color: #10b981; font-size: 15px; text-align: left; font-weight: 600;">Discount</td>
                                                <td style="padding: 10px 0; color: #10b981; font-size: 15px; text-align: right; font-weight: 700;">- ₱${orderData.discount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                            ` : ''}
                                            <tr style="border-top: 3px solid #cbd5e1;">
                                                <td style="padding: 24px 0 0; color: #0f172a; font-size: 20px; font-weight: 700; text-align: left; letter-spacing: -0.5px;">Total Amount</td>
                                                <td style="padding: 24px 0 0; color: #3b82f6; font-size: 32px; font-weight: 800; text-align: right; letter-spacing: -1px;">₱${orderData.total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Additional Information Sections -->
                    ${orderData.notes ? `
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 5px solid #3b82f6; padding: 20px 24px; border-radius: 12px;">
                                <p style="margin: 0 0 10px; color: #1e40af; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">📝 Notes</p>
                                <p style="margin: 0; color: #1e3a8a; font-size: 15px; line-height: 1.7;">${orderData.notes}</p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.requestSalesInvoice ? `
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 5px solid #f59e0b; padding: 20px 24px; border-radius: 12px;">
                                <p style="margin: 0 0 10px; color: #92400e; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">📄 Sales Invoice Requested</p>
                                <p style="margin: 0; color: #78350f; font-size: 15px; line-height: 1.7;">A sales invoice has been requested for this order. The invoice will be processed and sent separately.</p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.signatureUrl ? `
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <div style="background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px;">
                                <p style="margin: 0 0 16px; color: #64748b; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">✍️ Client Signature</p>
                                <div style="background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center;">
                                    <img src="${orderData.signatureUrl}" alt="Client Signature" style="max-width: 100%; height: auto; border-radius: 4px;" />
                                </div>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.agentName || orderData.agentEmail || orderData.agentPhone ? `
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-left: 5px solid #10b981; padding: 20px 24px; border-radius: 12px;">
                                <p style="margin: 0 0 10px; color: #065f46; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">💬 Need Help?</p>
                                <p style="margin: 0; color: #047857; font-size: 15px; line-height: 1.7;">
                                  ${orderData.agentName ? `Your sales agent <strong>${orderData.agentName}</strong>` : 'Your sales agent'}${orderData.agentEmail || orderData.agentPhone ? ' can be reached at:' : ''}<br>
                                  ${orderData.agentEmail ? `<a href="mailto:${orderData.agentEmail}" style="color:#059669; text-decoration:none; font-weight:600;">${orderData.agentEmail}</a>` : ''}
                                  ${orderData.agentEmail && orderData.agentPhone ? '<br>' : ''}
                                  ${orderData.agentPhone ? `<a href="tel:${orderData.agentPhone}" style="color:#059669; text-decoration:none; font-weight:600;">${orderData.agentPhone}</a>` : ''}
                                </p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 40px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-top: 1px solid #e2e8f0; text-align: center;">
                            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 8px; margin-bottom: 24px; text-align: left;">
                                <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 600;">⏳ Status: Pending Approval</p>
                                <p style="margin: 8px 0 0; color: #1e3a8a; font-size: 13px; line-height: 1.6;">Your order is currently being reviewed. We'll send you a notification once it's approved and ready for processing.</p>
                            </div>
                            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">This is an automated email from B1G Corporation.</p>
                            <p style="margin: 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} B1G Corporation. All rights reserved.</p>
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
    const itemsHTML = orderData.items.map((item, index) => `
    <tr style="border-bottom: 1px solid #f3f4f6; background-color: ${index % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding: 16px 12px; color: #1f2937; font-size: 14px; line-height: 1.5;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 2px;">${item.brandName}</div>
        <div style="font-size: 13px; color: #6b7280;">${item.variantName}</div>
      </td>
      <td style="padding: 16px 12px; color: #6b7280; text-align: center; font-size: 13px;">${item.variantType}</td>
      <td style="padding: 16px 12px; color: #1f2937; text-align: center; font-size: 14px; font-weight: 600;">×${item.quantity}</td>
      <td style="padding: 16px 12px; color: #6b7280; text-align: right; font-size: 14px;">₱${item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding: 16px 12px; color: #111827; text-align: right; font-size: 15px; font-weight: 700;">₱${item.total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                    ${orderData.paymentMethod || orderData.pricingStrategy ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                                <h3 style="margin-top: 0; color: #111827; font-size: 16px;">Order Details</h3>
                                <p style="margin: 4px 0; color: #4b5563;">Status: <span style="font-weight: 600; color: #2563eb;">Pending Approval</span></p>
                                <p style="margin: 4px 0; color: #4b5563;">Pricing Strategy: <span style="font-weight: 600; color: #111827;">${orderData.pricingStrategy === 'special' ? 'SPECIAL (ALLOCATED)' : (orderData.pricingStrategy?.toUpperCase() || 'RSP') + ' PRICING'}</span></p>
                                <p style="margin: 4px 0; color: #4b5563;">Payment Method: <span style="font-weight: 600; color: #111827;">${orderData.paymentMethod === 'GCASH' ? 'GCash' : orderData.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : orderData.paymentMethod === 'CHEQUE' ? 'Cheque' : 'Cash'}</span></p>
                            </div>
                        </td>
                    </tr>
                    ` : ''}
                    ${orderData.paymentProofUrl ? `
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
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

        // Fetch super admin and finance emails dynamically
        let superAdminEmail = 'itdepartment.b1g@gmail.com'; // Fallback
        let financeEmail = 'flmromey.b1g@gmail.com'; // Fallback

        if (data.companyId) {
            try {
                // Fetch super admin email from company
                const { data: company, error: companyError } = await supabase
                    .from('companies')
                    .select('super_admin_email')
                    .eq('id', data.companyId)
                    .single();

                if (!companyError && company?.super_admin_email) {
                    superAdminEmail = company.super_admin_email;
                    console.log('📧 Using super admin email:', superAdminEmail);
                }

                // Fetch finance email from profiles
                const { data: financeProfile, error: financeError } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('company_id', data.companyId)
                    .eq('role', 'finance')
                    .eq('status', 'active')
                    .limit(1)
                    .single();

                if (!financeError && financeProfile?.email) {
                    financeEmail = financeProfile.email;
                    console.log('📧 Using finance email:', financeEmail);
                }
            } catch (fetchError) {
                console.warn('⚠️ Failed to fetch dynamic emails, using fallbacks:', fetchError);
            }
        }

        // Send receipt email to Super Admin and Finance department
        try {
            const recipients = `${superAdminEmail},${financeEmail}`;
            const itResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipients,
                    subject: `Order Receipt - ${data.orderNumber} - ${data.clientName}`,
                    html: itReceiptContent,
                }),
            });

            if (!itResponse.ok) {
                const errorData = await itResponse.json().catch(() => ({ error: 'Unknown error' }));
                console.error('⚠️ Failed to send receipt email to Super Admin and Finance departments:', errorData);
                // Don't throw error - client email was sent successfully
            } else {
                const itResult = await itResponse.json();
                console.log('✅ Receipt email sent successfully to Super Admin and Finance departments:', itResult);
            }
        } catch (itError) {
            console.error('⚠️ Error sending receipt email to Super Admin and Finance departments (non-critical):', itError);
            // Don't throw error - client email was sent successfully
        }

        return clientResult;
    } catch (error) {
        console.error('Failed to send order confirmation email:', error);
        throw error;
    }
}

