import nodemailer from 'nodemailer';
import { logger } from '../config/logger';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const FROM = `"DocuVault" <${process.env.EMAIL_USER}>`;

interface MailPayload {
  to: string;
  subject: string;
  html: string;
}

const send = async (payload: MailPayload): Promise<void> => {
  try {
    await transporter.sendMail({ from: FROM, ...payload });
  } catch (err) {
    logger.error('Failed to send email', { to: payload.to, subject: payload.subject, err });
  }
};

export const sendVerificationEmail = (email: string, token: string): Promise<void> =>
  send({
    to: email,
    subject: 'Verify your DocuVault email address',
    html: `
      <p>Thanks for registering. Click the link below to verify your email:</p>
      <p><a href="${FRONTEND}/verify-email?token=${token}">Verify email</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });

export const sendPasswordResetEmail = (email: string, token: string): Promise<void> =>
  send({
    to: email,
    subject: 'Reset your DocuVault password',
    html: `
      <p>You requested a password reset. Click the link below:</p>
      <p><a href="${FRONTEND}/reset-password?token=${token}">Reset password</a></p>
      <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  });

export const sendShareEmail = (
  to: string,
  shareToken: string,
  documentTitle: string,
  permission: string
): Promise<void> =>
  send({
    to,
    subject: `${documentTitle} has been shared with you on DocuVault`,
    html: `
      <p>A document has been shared with you with <strong>${permission}</strong> permission.</p>
      <p><a href="${FRONTEND}/share/${shareToken}">Open document</a></p>
      <p>This link may expire. Do not forward it.</p>
    `,
  });

export const sendSignatureRequestEmail = (
  to: string,
  documentTitle: string,
  documentId: string
): Promise<void> =>
  send({
    to,
    subject: `Signature requested: ${documentTitle}`,
    html: `
      <p>Your signature has been requested on <strong>${documentTitle}</strong>.</p>
      <p><a href="${FRONTEND}/documents/${documentId}/sign">Review and sign</a></p>
    `,
  });

export const sendSignatureCompleteEmail = (
  ownerEmail: string,
  documentTitle: string
): Promise<void> =>
  send({
    to: ownerEmail,
    subject: `All signatures collected: ${documentTitle}`,
    html: `
      <p>All requested signatures for <strong>${documentTitle}</strong> have been collected.</p>
      <p><a href="${FRONTEND}/dashboard">View in DocuVault</a></p>
    `,
  });
