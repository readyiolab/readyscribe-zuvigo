import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { createLogger } from "@zuvigo/logger";

const log = createLogger({ name: "email" });

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailService {
  send(input: SendEmailInput): Promise<void>;
}

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  from?: string;
}

export class SmtpEmailService implements EmailService {
  private transporter: Transporter;
  private defaultFrom: string;

  constructor(config: SmtpConfig) {
    this.defaultFrom = config.from || process.env.EMAIL_FROM || "noreply@zuvigo.com";
    this.transporter = nodemailer.createTransport({
      host: config.host || process.env.SMTP_HOST || "mail.smtp2go.com",
      port: Number(config.port || process.env.SMTP_PORT || 2525),
      secure: config.secure ?? (Number(config.port || process.env.SMTP_PORT) === 465),
      auth: {
        user: config.user || process.env.SMTP_USER || "",
        pass: config.pass || process.env.SMTP_PASS || "",
      },
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.defaultFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html || (input.text ? `<p>${input.text.replace(/\n/g, "<br/>")}</p>` : undefined),
      });
      log.info({ to: input.to, subject: input.subject, messageId: info.messageId }, "Email sent via SMTP");
    } catch (err) {
      log.error({ err, to: input.to, subject: input.subject }, "Failed to send email via SMTP");
      throw err;
    }
  }
}

export class LogEmailService implements EmailService {
  async send(input: SendEmailInput): Promise<void> {
    log.info({ to: input.to, subject: input.subject }, "Email queued (log adapter)");
  }
}

export function createEmailService(config?: SmtpConfig): EmailService {
  const host = config?.host || process.env.SMTP_HOST;
  const user = config?.user || process.env.SMTP_USER;
  const pass = config?.pass || process.env.SMTP_PASS;

  if (host && user && pass) {
    return new SmtpEmailService(config || {});
  }
  return new LogEmailService();
}
