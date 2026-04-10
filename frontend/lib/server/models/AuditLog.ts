import { Schema, model, models } from 'mongoose';

const AuditLogSchema = new Schema(
  {
    action: {
      type: String,
      enum: ['allow_issuer', 'remove_issuer', 'issue_credential', 'approve_application', 'reject_application'],
      required: true,
      index: true,
    },
    walletAddress: { type: String, required: true, lowercase: true, trim: true, index: true },
    actor: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const AuditLogModel = models.AuditLog || model('AuditLog', AuditLogSchema);
