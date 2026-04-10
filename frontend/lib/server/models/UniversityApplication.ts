import { Schema, model, models } from 'mongoose';

const UniversityApplicationSchema = new Schema(
  {
    institutionName: { type: String, required: true, trim: true },
    officialEmail: { type: String, required: true, trim: true, lowercase: true },
    website: { type: String, required: true, trim: true, lowercase: true },
    accreditationId: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    representativeName: { type: String, required: true, trim: true },
    walletAddress: { type: String, required: true, trim: true, lowercase: true, index: true },
    supportingNotes: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },
  },
  { timestamps: true },
);

export const UniversityApplicationModel =
  models.UniversityApplication || model('UniversityApplication', UniversityApplicationSchema);
