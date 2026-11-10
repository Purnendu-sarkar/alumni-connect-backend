import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/index.js';
import { logger } from '../../config/logger.js';

export interface CapturedEmail {
  id: string;
  to: string;
  subject: string;
  token?: string;
  resetUrl?: string;
  verificationUrl?: string;
  html: string;
  text: string;
  timestamp: Date;
  deliveredViaSmtp: boolean;
  error?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private capturedEmails: CapturedEmail[] = [];
  private readonly maxCaptured = 50;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        tls: {
          rejectUnauthorized: false,
        },
      });
      logger.info(
        { host: env.SMTP_HOST, port: env.SMTP_PORT },
        'Email service initialized (Mailpit / Local SMTP target).',
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize SMTP transporter. Falling back to in-memory email capture.');
      this.transporter = null;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; resetUrl: string }> {
    const resetUrl = `${env.APP_FRONTEND_URL}/reset-password?token=${token}`;
    const subject = 'Reset Your AlumniConnect Password';
    const text = `Hello ${name},\n\nYou requested a password reset for your AlumniConnect account.\nUse the following link to reset your password (valid for 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <h2 style="color: #111; margin-top: 0;">Password Reset Request</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>We received a request to reset your password on the Alumni Networking Platform.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Reset Your Password
          </a>
        </p>
        <p style="font-size: 0.875rem; color: #666;">
          This link will expire in <strong>15 minutes</strong> and can only be used once.<br />
          Or copy and paste this URL into your browser: <br />
          <code style="background: #f4f4f4; padding: 2px 6px; border-radius: 4px; word-break: break-all;">${resetUrl}</code>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 0.75rem; color: #999;">If you did not request this password reset, no action is required.</p>
      </div>
    `;

    let deliveredViaSmtp = false;
    let smtpError: string | undefined;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });
        deliveredViaSmtp = true;
        logger.info({ to, subject }, 'Password reset email sent via SMTP (Mailpit).');
      } catch (err) {
        smtpError = err instanceof Error ? err.message : String(err);
        logger.warn(
          { to, err: smtpError, resetUrl },
          'SMTP delivery failed (Mailpit may not be running). Email captured in-memory for testing.',
        );
      }
    }

    const emailRecord: CapturedEmail = {
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to,
      subject,
      token,
      resetUrl,
      html,
      text,
      timestamp: new Date(),
      deliveredViaSmtp,
      error: smtpError,
    };

    this.capturedEmails.unshift(emailRecord);
    if (this.capturedEmails.length > this.maxCaptured) {
      this.capturedEmails.pop();
    }

    return { success: true, deliveredViaSmtp, token, resetUrl };
  }

  async sendVerificationEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; verificationUrl: string }> {
    const verificationUrl = `${env.APP_FRONTEND_URL}/verify-email?token=${token}`;
    const subject = 'Verify Your AlumniConnect Email';
    const text = `Hello ${name},\n\nPlease confirm your university email address by visiting:\n\n${verificationUrl}\n\nThis link is valid for 24 hours.`;
    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <h2 style="color: #111; margin-top: 0;">Confirm Your University Email</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Thank you for registering on AlumniConnect. Confirm your email address to complete your registration:</p>
        <p style="margin: 24px 0;">
          <a href="${verificationUrl}" style="background-color: #16a34a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p style="font-size: 0.875rem; color: #666;">
          Link valid for <strong>24 hours</strong>.<br />
          URL: <code style="background: #f4f4f4; padding: 2px 6px; border-radius: 4px; word-break: break-all;">${verificationUrl}</code>
        </p>
      </div>
    `;

    let deliveredViaSmtp = false;
    let smtpError: string | undefined;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });
        deliveredViaSmtp = true;
        logger.info({ to, subject }, 'Verification email sent via SMTP (Mailpit).');
      } catch (err) {
        smtpError = err instanceof Error ? err.message : String(err);
        logger.warn(
          { to, err: smtpError, verificationUrl },
          'SMTP delivery failed. Email captured in-memory for testing.',
        );
      }
    }

    const emailRecord: CapturedEmail = {
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to,
      subject,
      token,
      verificationUrl,
      html,
      text,
      timestamp: new Date(),
      deliveredViaSmtp,
      error: smtpError,
    };

    this.capturedEmails.unshift(emailRecord);
    if (this.capturedEmails.length > this.maxCaptured) {
      this.capturedEmails.pop();
    }

    return { success: true, deliveredViaSmtp, token, verificationUrl };
  }

  async sendModeratorInvitationEmail(
    to: string,
    token: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; setupUrl: string }> {
    const setupUrl = `${env.APP_FRONTEND_URL}/setup-account?token=${token}`;
    const subject = 'Invitation to join AlumniConnect as Community Moderator';
    const text = `Hello,\n\nYou have been invited to join AlumniConnect as a Community Moderator.\nClick the link below to accept the invitation and activate your account:\n\n${setupUrl}\n\nThis invitation link is valid for 72 hours.`;
    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <h2 style="color: #111; margin-top: 0;">Moderator Invitation</h2>
        <p>You have been invited by the platform Super Administrator to join AlumniConnect as a <strong>Community Moderator</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${setupUrl}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Accept Invitation & Setup Password
          </a>
        </p>
        <p style="font-size: 0.875rem; color: #666;">
          This link will expire in <strong>72 hours</strong> and can only be used once.<br />
          URL: <code style="background: #f4f4f4; padding: 2px 6px; border-radius: 4px; word-break: break-all;">${setupUrl}</code>
        </p>
      </div>
    `;

    let deliveredViaSmtp = false;
    let smtpError: string | undefined;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });
        deliveredViaSmtp = true;
        logger.info({ to, subject }, 'Moderator invitation email sent via SMTP (Mailpit).');
      } catch (err) {
        smtpError = err instanceof Error ? err.message : String(err);
        logger.warn(
          { to, err: smtpError, setupUrl },
          'SMTP delivery failed. Email captured in-memory for testing.',
        );
      }
    }

    const emailRecord: CapturedEmail = {
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to,
      subject,
      token,
      html,
      text,
      timestamp: new Date(),
      deliveredViaSmtp,
      error: smtpError,
    };

    this.capturedEmails.unshift(emailRecord);
    if (this.capturedEmails.length > this.maxCaptured) {
      this.capturedEmails.pop();
    }

    return { success: true, deliveredViaSmtp, token, setupUrl };
  }

  async sendVerificationDecisionEmail(
    to: string,
    name: string,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean }> {
    const isApproved = status === 'APPROVED';
    const subject = isApproved
      ? 'Your AlumniConnect Account Has Been Verified!'
      : 'Update on Your AlumniConnect Verification';
    const text = isApproved
      ? `Hello ${name},\n\nCongratulations! Your university alumni accreditation has been verified and approved by the Super Administrator. You can now log in and access all networking and job features.\n\n${env.APP_FRONTEND_URL}/login`
      : `Hello ${name},\n\nYour recent alumni verification submission was not approved.${reason ? ` Reason: ${reason}` : ''}\nPlease review your profile details or contact the administration for assistance.\n\n${env.APP_FRONTEND_URL}/login`;
    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <h2 style="color: ${isApproved ? '#16a34a' : '#dc2626'}; margin-top: 0;">
          ${isApproved ? 'Verification Approved' : 'Verification Update'}
        </h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>${isApproved ? 'Your university membership accreditation has been verified and approved by the Super Administrator.' : 'Your university verification submission was not approved at this time.'}</p>
        ${!isApproved && reason ? `<p style="padding: 12px; background: #fef2f2; border-left: 4px solid #ef4444;"><strong>Feedback:</strong> ${reason}</p>` : ''}
        <p style="margin: 24px 0;">
          <a href="${env.APP_FRONTEND_URL}/login" style="background-color: ${isApproved ? '#16a34a' : '#111'}; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            ${isApproved ? 'Sign In to Your Account' : 'Visit Account'}
          </a>
        </p>
      </div>
    `;

    let deliveredViaSmtp = false;
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });
        deliveredViaSmtp = true;
      } catch (err) {
        logger.warn({ to, err }, 'SMTP delivery failed for verification decision email.');
      }
    }

    const emailRecord: CapturedEmail = {
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to,
      subject,
      html,
      text,
      timestamp: new Date(),
      deliveredViaSmtp,
    };
    this.capturedEmails.unshift(emailRecord);
    if (this.capturedEmails.length > this.maxCaptured) {
      this.capturedEmails.pop();
    }

    return { success: true, deliveredViaSmtp };
  }

  getCapturedEmails(): CapturedEmail[] {
    return this.capturedEmails;
  }

  clearCapturedEmails(): void {
    this.capturedEmails = [];
  }
}

export const emailService = new EmailService();
