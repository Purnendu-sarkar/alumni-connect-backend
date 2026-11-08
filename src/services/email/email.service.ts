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
  setupUrl?: string;
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
        secure: env.SMTP_SECURE, // false for port 587 (STARTTLS)
        requireTLS: env.SMTP_REQUIRE_TLS,
        connectionTimeout: env.EMAIL_CONNECTION_TIMEOUT,
        greetingTimeout: env.EMAIL_GREETING_TIMEOUT,
        socketTimeout: env.EMAIL_SOCKET_TIMEOUT,
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? {
                user: env.SMTP_USER.trim(),
                pass: env.SMTP_PASS.trim().replace(/\s+/g, ''),
              }
            : undefined,
        tls: {
          rejectUnauthorized: env.NODE_ENV === 'production',
        },
      });
    } catch (err) {
      logger.warn(
        { err },
        'Failed to initialize SMTP transporter. Falling back to in-memory email capture.',
      );
      this.transporter = null;
    }
  }

  /**
   * Diagnostic verification of the SMTP transport (e.g. Gmail STARTTLS connectivity and Google App Password).
   * Safe to call on server boot or on demand without throwing unhandled exceptions.
   */
  async verifyEmailTransport(): Promise<boolean> {
    if (!env.EMAIL_ENABLED) {
      logger.info('[Email Transport] Email delivery is globally disabled via EMAIL_ENABLED=false.');
      return false;
    }

    if (!this.transporter) {
      logger.warn(
        '[Email Transport] Transporter not initialized. Live SMTP dispatch is disabled. Emails will be captured in-memory.',
      );
      return false;
    }

    // Diagnostic guidance for Google Gmail SMTP
    if (env.SMTP_HOST.includes('gmail.com') && (!env.SMTP_USER || !env.SMTP_PASS)) {
      logger.warn(
        '[Email Transport] Gmail SMTP selected (smtp.gmail.com:587) but SMTP_USER or SMTP_PASS (Google App Password) is missing in .env. Live dispatch requires a 16-character Google App Password. Outgoing emails will be safely captured in-memory for testing.',
      );
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn(
        {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          error: err.message,
        },
        '[Email Transport] SMTP connection check failed. If using Gmail, ensure 2FA is active and a 16-character App Password is used. Outgoing emails will continue to be safely captured in-memory.',
      );
      return false;
    }
  }

  /**
   * Internal centralized dispatcher with fallback and buffer recording
   */
  private async dispatchEmail(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
    token?: string;
    url?: string;
    urlType?: 'resetUrl' | 'verificationUrl' | 'setupUrl';
  }): Promise<{ success: boolean; deliveredViaSmtp: boolean; token?: string; url?: string; error?: string }> {
    let deliveredViaSmtp = false;
    let smtpError: string | undefined;

    if (this.transporter && env.EMAIL_ENABLED) {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        deliveredViaSmtp = true;
      } catch (err) {
        smtpError = err instanceof Error ? err.message : String(err);
        logger.warn(
          { to: options.to, err: smtpError },
          'SMTP dispatch failed. Email safely recorded in-memory buffer.',
        );
      }
    }

    const emailRecord: CapturedEmail = {
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to: options.to,
      subject: options.subject,
      token: options.token,
      ...(options.urlType === 'resetUrl' && { resetUrl: options.url }),
      ...(options.urlType === 'verificationUrl' && { verificationUrl: options.url }),
      ...(options.urlType === 'setupUrl' && { setupUrl: options.url }),
      html: options.html,
      text: options.text,
      timestamp: new Date(),
      deliveredViaSmtp,
      error: smtpError,
    };

    this.capturedEmails.unshift(emailRecord);
    if (this.capturedEmails.length > this.maxCaptured) {
      this.capturedEmails.pop();
    }

    return {
      success: true,
      deliveredViaSmtp,
      token: options.token,
      url: options.url,
      error: smtpError,
    };
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; resetUrl: string }> {
    const resetUrl = `${env.APP_FRONTEND_URL}/reset-password?token=${token}`;
    const subject = 'Reset Your AlumniConnect Password';
    const text = `Hello ${name},\n\nYou requested a password reset for your AlumniConnect account at ${env.INSTITUTION_NAME}.\nUse the following link to reset your password (valid for 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #0B1F3A; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #EEF2FF; color: #4338CA; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Security Alert
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          We received a request to reset your password on the <strong>${env.INSTITUTION_NAME}</strong> Alumni Networking Platform.
        </p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${resetUrl}" style="background-color: #0B1F3A; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Reset Your Password
          </a>
        </p>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="font-size: 13px; color: #64748B; margin: 0 0 8px;">
            This single-use link will expire in <strong>15 minutes</strong>.
          </p>
          <p style="font-size: 12px; color: #64748B; margin: 0; word-break: break-all;">
            If the button above does not work, copy and paste this URL into your browser:<br />
            <code style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #1E293B;">${resetUrl}</code>
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          If you did not request this password reset, no action is required and your account remains safe.<br />
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect.
        </p>
      </div>
    `;

    const result = await this.dispatchEmail({
      to,
      subject,
      text,
      html,
      token,
      url: resetUrl,
      urlType: 'resetUrl',
    });

    return {
      success: result.success,
      deliveredViaSmtp: result.deliveredViaSmtp,
      token,
      resetUrl,
      error: result.error,
    };
  }

  async sendVerificationEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; verificationUrl: string; error?: string }> {
    const verificationUrl = `${env.APP_FRONTEND_URL}/verify-email?token=${token}`;
    const subject = 'Verify Your University Email — AlumniConnect';
    const text = `Hello ${name},\n\nThank you for joining AlumniConnect at ${env.INSTITUTION_NAME}.\nPlease verify your email address using the link below (valid for 24 hours):\n\n${verificationUrl}\n\nIf you did not register, please ignore this email.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #0B1F3A; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #ECFDF5; color: #059669; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Institutional Email Verification
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Confirm Your University Identity</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Thank you for registering on the <strong>${env.INSTITUTION_NAME}</strong> AlumniConnect platform. Please confirm your email address to activate your account access:
        </p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${verificationUrl}" style="background-color: #2563EB; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
            Verify Email Address
          </a>
        </p>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="font-size: 13px; color: #64748B; margin: 0 0 8px;">
            This single-use link is valid for <strong>24 hours</strong>.
          </p>
          <p style="font-size: 12px; color: #64748B; margin: 0; word-break: break-all;">
            If the button doesn't work, copy and paste this URL into your browser:<br />
            <code style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #1E293B;">${verificationUrl}</code>
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect. Privacy-First Academic Network.
        </p>
      </div>
    `;

    const result = await this.dispatchEmail({
      to,
      subject,
      text,
      html,
      token,
      url: verificationUrl,
      urlType: 'verificationUrl',
    });

    return {
      success: result.success,
      deliveredViaSmtp: result.deliveredViaSmtp,
      token,
      verificationUrl,
      error: result.error,
    };
  }

  async sendAccountSetupEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; setupUrl: string; error?: string }> {
    const setupUrl = `${env.APP_FRONTEND_URL}/setup-account?token=${token}`;
    const subject = 'Set Up Your AlumniConnect Super Admin Account';
    const text = `Hello ${name},\n\nYou have been designated as the First Super Administrator for AlumniConnect at ${env.INSTITUTION_NAME}.\n\nPlease complete your account setup and create your secure password using the link below (valid for 48 hours):\n\n${setupUrl}\n\nSecurity Notice: If you did not expect this administrative invitation, please contact your university IT department immediately.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #0B1F3A; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #EEF2FF; color: #4338CA; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Super Admin Provisioning
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Welcome to System Administration</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          You have been designated as the primary <strong>Super Administrator</strong> for <strong>${env.INSTITUTION_NAME}</strong>. Please complete your account setup by creating a strong, confidential password.
        </p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${setupUrl}" style="background-color: #2563EB; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
            Complete Account Setup
          </a>
        </p>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="font-size: 13px; color: #64748B; margin: 0 0 8px;">
            <strong>Security Notice:</strong> This single-use setup link will expire in <strong>48 hours</strong>. Never share this link or forward this email to anyone.
          </p>
          <p style="font-size: 12px; color: #64748B; margin: 0; word-break: break-all;">
            If the button doesn't work, copy and paste this URL into your browser:<br />
            <code style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #1E293B;">${setupUrl}</code>
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0; line-height: 1.5;">
          If you did not authorize or expect this account creation, please notify your institutional security office immediately.<br />
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect. Privacy-First Academic Network.
        </p>
      </div>
    `;

    const result = await this.dispatchEmail({
      to,
      subject,
      text,
      html,
      token,
      url: setupUrl,
      urlType: 'setupUrl',
    });

    return {
      success: result.success,
      deliveredViaSmtp: result.deliveredViaSmtp,
      token,
      setupUrl,
      error: result.error,
    };
  }

  async sendModeratorInvitationEmail(
    to: string,
    name: string,
    token: string,
    invitedByName?: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; setupUrl: string; error?: string }> {
    const setupUrl = `${env.APP_FRONTEND_URL}/setup-account?token=${token}`;
    const subject = 'Invitation: Moderator Role on AlumniConnect';
    const text = `Hello ${name},\n\nYou have been invited by ${invitedByName || 'the Super Administrator'} to join ${env.INSTITUTION_NAME} AlumniConnect as a Moderator.\n\nPlease accept the invitation and set up your account password using this link (valid for 48 hours):\n\n${setupUrl}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #0B1F3A; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #EEF2FF; color: #4338CA; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Moderator Invitation
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Join as a Platform Moderator</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          You have been designated by <strong>${invitedByName || 'the Administration'}</strong> to serve as an official <strong>Moderator</strong> for <strong>${env.INSTITUTION_NAME}</strong> AlumniConnect. As a moderator, you will help review job posts, event proposals, and community interactions.
        </p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${setupUrl}" style="background-color: #2563EB; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Accept Invitation &amp; Set Password
          </a>
        </p>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="font-size: 13px; color: #64748B; margin: 0 0 8px;">
            This single-use invitation link expires in <strong>48 hours</strong>.
          </p>
          <p style="font-size: 12px; color: #64748B; margin: 0; word-break: break-all;">
            URL: <code style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #1E293B;">${setupUrl}</code>
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect.
        </p>
      </div>
    `;

    const result = await this.dispatchEmail({
      to,
      subject,
      text,
      html,
      token,
      url: setupUrl,
      urlType: 'setupUrl',
    });

    return {
      success: result.success,
      deliveredViaSmtp: result.deliveredViaSmtp,
      token,
      setupUrl,
      error: result.error,
    };
  }

  async sendSuperAdminInvitationEmail(
    to: string,
    name: string,
    token: string,
    invitedByName?: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean; token: string; setupUrl: string; error?: string }> {
    const setupUrl = `${env.APP_FRONTEND_URL}/setup-account?token=${token}`;
    const subject = 'Super Administrator Privilege Invitation — AlumniConnect';
    const text = `Hello ${name},\n\nYou have been invited by ${invitedByName || 'a Super Administrator'} to join ${env.INSTITUTION_NAME} AlumniConnect as an additional Super Administrator.\n\nPlease complete your account setup and create your secure password using this link (valid for 48 hours):\n\n${setupUrl}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #0B1F3A; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #FEF3C7; color: #B45309; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Administrative Elevation
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Super Administrator Invitation</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          You have been granted <strong>Super Administrator</strong> privileges for <strong>${env.INSTITUTION_NAME}</strong> AlumniConnect by <strong>${invitedByName || 'System Administration'}</strong>.
        </p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${setupUrl}" style="background-color: #0B1F3A; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Accept &amp; Set Admin Credentials
          </a>
        </p>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="font-size: 13px; color: #64748B; margin: 0 0 8px;">
            This single-use administrative invitation expires in <strong>48 hours</strong>.
          </p>
          <p style="font-size: 12px; color: #64748B; margin: 0; word-break: break-all;">
            URL: <code style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #1E293B;">${setupUrl}</code>
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect.
        </p>
      </div>
    `;

    const result = await this.dispatchEmail({
      to,
      subject,
      text,
      html,
      token,
      url: setupUrl,
      urlType: 'setupUrl',
    });

    return {
      success: result.success,
      deliveredViaSmtp: result.deliveredViaSmtp,
      token,
      setupUrl,
      error: result.error,
    };
  }

  async sendAlumniApprovalEmail(
    to: string,
    name: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean }> {
    const loginUrl = `${env.APP_FRONTEND_URL}/login`;
    const subject = 'Your AlumniConnect Account Has Been Approved!';
    const text = `Hello ${name},\n\nGreat news! Your alumni verification request for ${env.INSTITUTION_NAME} AlumniConnect has been reviewed and approved by an administrator.\n\nYou can now sign in to your Alumni Dashboard and connect with fellow alumni and students:\n\n${loginUrl}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #059669; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #ECFDF5; color: #059669; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Verification Approved
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Welcome to the Verified Alumni Community</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Your institutional graduate credentials have been verified by the university administration. Your account is now fully active!
        </p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${loginUrl}" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Sign In to Alumni Dashboard
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect.
        </p>
      </div>
    `;

    return this.dispatchEmail({ to, subject, text, html });
  }

  async sendAlumniRejectionEmail(
    to: string,
    name: string,
    reason?: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean }> {
    const subject = 'Update Regarding Your AlumniConnect Verification Request';
    const text = `Hello ${name},\n\nYour alumni verification request for ${env.INSTITUTION_NAME} could not be approved at this time.\n\n${reason ? `Reason provided: ${reason}\n\n` : ''}If you believe this was an error, please reach out to your department coordinator or university administration.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #DC2626; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #FEF2F2; color: #DC2626; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Verification Notice
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Alumni Verification Status</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Thank you for your interest in joining AlumniConnect. After reviewing your submitted graduation information, our administrators were unable to verify your alumni credentials at this time.
        </p>
        ${
          reason
            ? `<div style="background-color: #F8FAFC; border-left: 4px solid #DC2626; padding: 14px 16px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Reason provided:</strong> ${reason}</p>
              </div>`
            : ''
        }
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          If you believe this decision was made in error or if you have official documentation to confirm your graduation, please contact the alumni affairs or registrar's office.
        </p>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect.
        </p>
      </div>
    `;

    return this.dispatchEmail({ to, subject, text, html });
  }

  async sendSecurityNotification(
    to: string,
    name: string,
    eventTitle: string,
    eventDescription: string,
  ): Promise<{ success: boolean; deliveredViaSmtp: boolean }> {
    const subject = `Security Alert: ${eventTitle} — AlumniConnect`;
    const text = `Hello ${name},\n\nA security event was registered on your AlumniConnect account at ${env.INSTITUTION_NAME}:\n\n${eventTitle}\n${eventDescription}\n\nIf you did not perform this action, please secure your account and contact your administrator immediately.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="background-color: #0B1F3A; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 8px; display: inline-block;">
            AC
          </div>
          <span style="font-size: 18px; font-weight: 700; color: #0B1F3A; margin-left: 8px;">AlumniConnect</span>
        </div>
        <div style="display: inline-block; padding: 4px 10px; background-color: #FEF3C7; color: #B45309; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
          Security Alert
        </div>
        <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 20px; font-weight: 700;">${eventTitle}</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          ${eventDescription}
        </p>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          &copy; ${new Date().getFullYear()} ${env.INSTITUTION_NAME} AlumniConnect.
        </p>
      </div>
    `;

    return this.dispatchEmail({ to, subject, text, html });
  }

  getCapturedEmails(): CapturedEmail[] {
    return this.capturedEmails;
  }

  clearCapturedEmails(): void {
    this.capturedEmails = [];
  }
}

export const emailService = new EmailService();
