import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

export const sendResetPasswordEmail = async (email: string, resetToken: string) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`

  const mailOptions = {
    from: `"Context Support" <${process.env.SMTP_FROM || 'support@yourdomain.com'}>`,
    to: email,
    subject: 'Reset your Context Password',
    html: `
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <a href="${resetUrl}" style="padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>This link is valid for 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `
  }

  await transporter.sendMail(mailOptions)
}
