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
    agentName?: string;
    agentEmail?: string;
    agentPhone?: string;
    leaderName?: string;
    paymentMethod?: string;
    selectedBank?: string;
    paymentProofUrl?: string;
    pricingStrategy?: string;
    requestSalesInvoice?: boolean;
    companyId?: string;
}

// CLIENT EMAIL - Simple, human, transactional
function generateEmailHTML(orderData: OrderEmailData): string {
    const formatPrice = (price: number) => `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const formatPaymentMethod = (method: string, bankName?: string) => {
        if (!method) return 'Cash';
        
        // Handle enum values
        if (method === 'BANK_TRANSFER') {
            return bankName ? `Bank Transfer (${bankName})` : 'Bank Transfer';
        }
        if (method === 'GCASH') return 'GCash';
        if (method === 'CHEQUE') return 'Cheque';
        if (method === 'CASH') return 'Cash';
        
        // Already formatted (like "Bank Transfer (BPI)")
        return method;
    };
    
    const itemsHTML = orderData.items.map(item => `
        <tr>
            <td style="padding: 8px 12px 8px 0; border-bottom: 1px solid #eee;">
                <div style="font-weight: 500; color: #111;">${item.brandName}</div>
                <div style="font-size: 13px; color: #666; margin-top: 2px;">${item.variantName} · ${item.variantType}</div>
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${item.quantity}</td>
            <td style="padding: 8px 0 8px 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 500;">${formatPrice(item.total)}</td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order ${orderData.orderNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #333; background: #fafafa;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <div style="max-width: 600px; background: #fff; border: 1px solid #e5e5e5; padding: 32px;">
                    
                    <!-- Header -->
                    <div style="border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">B1G Corporation</h1>
                    </div>

                    <!-- Main Content -->
                    <div style="margin-bottom: 24px;">
                        <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">Order confirmation</p>
                        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #111;">${orderData.orderNumber}</h2>
                        <p style="margin: 0 0 4px 0; color: #666;">Hi ${orderData.clientName},</p>
                        <p style="margin: 0 0 24px 0; color: #333;">This email serves as your official e-receipt. Thank you for your transaction with B1G Corporation.</p>
                    </div>

                    <!-- Order Details -->
                    <div style="margin-bottom: 24px; padding: 16px; background: #fafafa; border-left: 3px solid #111;">
                        <table style="width: 100%; font-size: 14px;">
                            <tr>
                                <td style="padding: 4px 0; color: #666;">Order date:</td>
                                <td style="padding: 4px 0; text-align: right; color: #111;">${new Date(orderData.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; color: #666;">Payment method:</td>
                                <td style="padding: 4px 0; text-align: right; color: #111;">${formatPaymentMethod(orderData.paymentMethod, orderData.selectedBank)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Items -->
                    <div style="margin-bottom: 24px;">
                        <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #111;">Items</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="padding: 8px 12px 8px 0; text-align: left; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Product</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Qty</th>
                                    <th style="padding: 8px 0 8px 12px; text-align: right; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHTML}</tbody>
                        </table>
                    </div>

                    <!-- Totals -->
                    <div style="margin-bottom: 24px; padding-top: 16px; border-top: 2px solid #ddd;">
                        <table style="width: 100%; max-width: 300px; margin-left: auto;">
                            <tr>
                                <td style="padding: 6px 0; color: #666;">Subtotal</td>
                                <td style="padding: 6px 0; text-align: right; color: #111;">${formatPrice(orderData.subtotal)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #666;">Tax</td>
                                <td style="padding: 6px 0; text-align: right; color: #111;">${formatPrice(orderData.tax)}</td>
                            </tr>
                            ${orderData.discount > 0 ? `
                            <tr>
                                <td style="padding: 6px 0; color: #666;">Discount</td>
                                <td style="padding: 6px 0; text-align: right; color: #10b981;">−${formatPrice(orderData.discount)}</td>
                            </tr>
                            ` : ''}
                            <tr style="border-top: 2px solid #ddd;">
                                <td style="padding: 12px 0 0 0; font-weight: 600; color: #111;">Total</td>
                                <td style="padding: 12px 0 0 0; text-align: right; font-weight: 600; font-size: 18px; color: #111;">${formatPrice(orderData.total)}</td>
                            </tr>
                        </table>
                    </div>

                    ${orderData.notes ? `
                    <!-- Notes -->
                    <div style="margin-bottom: 24px; padding: 16px; background: #fffbeb; border-left: 3px solid #f59e0b;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #92400e;">Note</p>
                        <p style="margin: 0; font-size: 14px; color: #78350f;">${orderData.notes}</p>
                    </div>
                    ` : ''}

                    ${orderData.requestSalesInvoice ? `
                    <div style="margin-bottom: 24px; padding: 12px; background: #fffbeb; border-left: 3px solid #f59e0b;">
                        <p style="margin: 0; font-size: 14px; color: #78350f;">Sales invoice requested — We’ll provide your agent with a copy of the sales invoice. Please contact your agent for the copy.</p>
                    </div>
                    ` : ''}

                    ${orderData.signatureUrl ? `
                    <!-- Signature -->
                    <div style="margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Your signature</p>
                        <div style="border: 1px solid #e5e5e5; padding: 12px; background: #fafafa;">
                            <img src="${orderData.signatureUrl}" alt="Signature" style="max-width: 100%; height: auto; display: block;" />
                        </div>
                    </div>
                    ` : ''}

                    ${orderData.agentName || orderData.agentEmail || orderData.agentPhone ? `
                    <!-- Contact -->
                    <div style="margin-bottom: 24px; padding: 16px; background: #f0fdf4; border-left: 3px solid #10b981;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #065f46;">Questions about your order?</p>
                        <p style="margin: 0; font-size: 14px; color: #047857;">
                            ${orderData.agentName ? `Contact ${orderData.agentName}` : 'Contact your sales agent'}${orderData.agentEmail || orderData.agentPhone ? ':' : '.'}<br>
                            ${orderData.agentEmail ? `<a href="mailto:${orderData.agentEmail}" style="color: #047857;">${orderData.agentEmail}</a>` : ''}
                            ${orderData.agentEmail && orderData.agentPhone ? '<br>' : ''}
                            ${orderData.agentPhone ? `<a href="tel:${orderData.agentPhone}" style="color: #047857;">${orderData.agentPhone}</a>` : ''}
                        </p>
                    </div>
                    ` : ''}

                    <!-- Footer -->
                    <div style="padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #999;">
                        <p style="margin: 0;">— B1G Corporation</p>
                    </div>

                </div>
            </td>
        </tr>
    </table>
</body>
</html>
`;
}

// INTERNAL RECEIPT - Finance & System Admin
function generateITReceiptHTML(orderData: OrderEmailData): string {
    const formatPrice = (price: number) => `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const formatPaymentMethod = (method: string, selectedBank?: string) => {
        if (!method) return 'Cash';
        
        // Handle enum values
        if (method === 'BANK_TRANSFER') {
            return selectedBank ? `Bank Transfer (${selectedBank})` : 'Bank Transfer';
        }
        if (method === 'GCASH') return 'GCash';
        if (method === 'CHEQUE') return 'Cheque';
        if (method === 'CASH') return 'Cash';
        
        // Already formatted (like "Bank Transfer (BPI)")
        return method;
    };
    
    const itemsHTML = orderData.items.map(item => `
        <tr>
            <td style="padding: 8px 12px 8px 0; border-bottom: 1px solid #eee;">
                <div style="font-weight: 500; color: #111;">${item.brandName}</div>
                <div style="font-size: 13px; color: #666; margin-top: 2px;">${item.variantName} · ${item.variantType}</div>
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${item.quantity}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatPrice(item.unitPrice)}</td>
            <td style="padding: 8px 0 8px 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 500;">${formatPrice(item.total)}</td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Order ${orderData.orderNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #333; background: #fafafa;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <div style="max-width: 700px; background: #fff; border: 1px solid #e5e5e5; padding: 32px;">
                    
                    <!-- Header -->
                    <div style="border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">B1G Corporation · Internal Receipt</h1>
                    </div>

                    <!-- Alert -->
                    <div style="margin-bottom: 24px; padding: 16px; background: #eff6ff; border-left: 3px solid #3b82f6;">
                        <p style="margin: 0; font-weight: 500; color: #1e40af;">New order awaiting approval</p>
                    </div>

                    <!-- Order Info -->
                    <div style="margin-bottom: 24px;">
                        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #111;">${orderData.orderNumber}</h2>
                        <table style="width: 100%; font-size: 14px;">
                            <tr>
                                <td style="padding: 4px 0; color: #666; width: 140px;">Order date:</td>
                                <td style="padding: 4px 0; color: #111;">${new Date(orderData.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; color: #666;">Pricing strategy:</td>
                                <td style="padding: 4px 0; color: #111; font-weight: 500;">${orderData.pricingStrategy === 'special' ? 'Special (Allocated)' : (orderData.pricingStrategy?.toUpperCase() || 'RSP')}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; color: #666;">Payment method:</td>
                                <td style="padding: 4px 0; color: #111;">${formatPaymentMethod(orderData.paymentMethod, orderData.selectedBank)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Client Info -->
                    <div style="margin-bottom: 24px; padding: 16px; background: #fafafa; border-left: 3px solid #666;">
                        <p style="margin: 0 0 4px 0; font-size: 13px; color: #666;">Client</p>
                        <p style="margin: 0 0 2px 0; font-weight: 500; color: #111;">${orderData.clientName}</p>
                        <p style="margin: 0; font-size: 14px; color: #666;">${orderData.clientEmail}</p>
                    </div>

                    ${orderData.agentName ? `
                    <!-- Agent Info -->
                    <div style="margin-bottom: 24px;">
                        <table style="width: 100%; font-size: 14px;">
                            <tr>
                                <td style="padding: 4px 0; color: #666; width: 140px;">Sales agent</td>
                                <td style="padding: 4px 0; color: #111;">${orderData.agentName}</td>
                            </tr>
                            ${orderData.agentEmail ? `
                            <tr>
                                <td style="padding: 4px 0; color: #666;"></td>
                                <td style="padding: 4px 0; color: #666;">${orderData.agentEmail}</td>
                            </tr>
                            ` : ''}
                            ${orderData.agentPhone ? `
                            <tr>
                                <td style="padding: 4px 0; color: #666;"></td>
                                <td style="padding: 4px 0; color: #666;">${orderData.agentPhone}</td>
                            </tr>
                            ` : ''}
                            ${orderData.leaderName ? `
                            <tr>
                                <td style="padding: 4px 0; color: #666;">Team leader</td>
                                <td style="padding: 4px 0; color: #111;">${orderData.leaderName}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                    ` : ''}

                    <!-- Items -->
                    <div style="margin-bottom: 24px;">
                        <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #111;">Items</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="padding: 8px 12px 8px 0; text-align: left; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Product</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Qty</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Unit Price</th>
                                    <th style="padding: 8px 0 8px 12px; text-align: right; font-size: 13px; font-weight: 500; color: #666; border-bottom: 2px solid #ddd;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHTML}</tbody>
                        </table>
                    </div>

                    <!-- Totals -->
                    <div style="margin-bottom: 24px; padding-top: 16px; border-top: 2px solid #ddd;">
                        <table style="width: 100%; max-width: 300px; margin-left: auto;">
                            <tr>
                                <td style="padding: 6px 0; color: #666;">Subtotal</td>
                                <td style="padding: 6px 0; text-align: right; color: #111;">${formatPrice(orderData.subtotal)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #666;">Tax</td>
                                <td style="padding: 6px 0; text-align: right; color: #111;">${formatPrice(orderData.tax)}</td>
                            </tr>
                            ${orderData.discount > 0 ? `
                            <tr>
                                <td style="padding: 6px 0; color: #666;">Discount</td>
                                <td style="padding: 6px 0; text-align: right; color: #10b981;">−${formatPrice(orderData.discount)}</td>
                            </tr>
                            ` : ''}
                            <tr style="border-top: 2px solid #ddd;">
                                <td style="padding: 12px 0 0 0; font-weight: 600; color: #111;">Total</td>
                                <td style="padding: 12px 0 0 0; text-align: right; font-weight: 600; font-size: 18px; color: #111;">${formatPrice(orderData.total)}</td>
                            </tr>
                        </table>
                    </div>

                    ${orderData.notes ? `
                    <!-- Notes -->
                    <div style="margin-bottom: 24px; padding: 16px; background: #fffbeb; border-left: 3px solid #f59e0b;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #92400e;">Client note</p>
                        <p style="margin: 0; font-size: 14px; color: #78350f;">${orderData.notes}</p>
                    </div>
                    ` : ''}

                    ${orderData.requestSalesInvoice ? `
                    <div style="margin-bottom: 24px; padding: 12px; background: #fffbeb; border-left: 3px solid #f59e0b;">
                        <p style="margin: 0; font-size: 14px; color: #78350f;"><strong>Sales invoice requested</strong> — process and send separately to client.</p>
                    </div>
                    ` : ''}

                    ${orderData.paymentProofUrl ? `
                    <!-- Payment Proof -->
                    <div style="margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Payment proof</p>
                        <div style="border: 1px solid #e5e5e5; padding: 12px; background: #fafafa;">
                            <img src="${orderData.paymentProofUrl}" alt="Payment proof" style="max-width: 100%; height: auto; display: block;" />
                        </div>
                    </div>
                    ` : ''}

                    ${orderData.signatureUrl ? `
                    <!-- Signature -->
                    <div style="margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Client signature</p>
                        <div style="border: 1px solid #e5e5e5; padding: 12px; background: #fafafa;">
                            <img src="${orderData.signatureUrl}" alt="Signature" style="max-width: 100%; height: auto; display: block;" />
                        </div>
                    </div>
                    ` : ''}

                    <!-- Footer -->
                    <div style="padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #999;">
                        <p style="margin: 0;">Internal receipt for Finance & System Admin</p>
                    </div>

                </div>
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
                    subject: `New Order ${data.orderNumber} - ${data.clientName}`,
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
