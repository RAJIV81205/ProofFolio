import { Schema, model, models } from 'mongoose';

const IssuerSchema = new Schema(
  {
    walletAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    issuerPublicKeyHex: { type: String, default: null, lowercase: true, trim: true, index: true },
    attestationHashHex: { type: String, default: null, lowercase: true, trim: true },
    onChainRegisterTxHash: { type: String, default: null, trim: true },
    onChainRegisteredAt: { type: Date, default: null },
    approved: { type: Boolean, default: true, index: true },
    approvedBy: { type: String, default: 'admin' },
    approvedAt: { type: Date, default: Date.now },
    source: { type: String, enum: ['manual', 'application'], default: 'manual' },
    applicationId: { type: String, default: null },
  },
  { timestamps: true },
);

export const IssuerModel = models.Issuer || model('Issuer', IssuerSchema);
