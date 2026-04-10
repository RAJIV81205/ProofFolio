import { isValidObjectId } from 'mongoose';
import { connectMongo } from '@/lib/server/mongo';
import { AuditLogModel } from '@/lib/server/models/AuditLog';
import { IssuerModel } from '@/lib/server/models/Issuer';
import { UniversityApplicationModel } from '@/lib/server/models/UniversityApplication';

export interface AdminAuditLog {
  id: string;
  action:
    | 'allow_issuer'
    | 'remove_issuer'
    | 'issue_credential'
    | 'approve_application'
    | 'reject_application';
  walletAddress: string;
  actor: string;
  createdAt: string;
  metadata?: {
    degreeType?: number;
    graduationYear?: number;
    institutionId?: number;
    txHash?: string;
    commitmentHex?: string;
    applicationId?: string;
    institutionName?: string;
    reviewNote?: string;
  };
}

export interface UniversityApplicationInput {
  institutionName: string;
  officialEmail: string;
  website: string;
  accreditationId: string;
  country: string;
  city: string;
  representativeName: string;
  walletAddress: string;
  supportingNotes?: string;
}

export interface UniversityApplicationRecord extends UniversityApplicationInput {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

function isWalletAddressLikelyValid(value: string): boolean {
  if (value.length < 20 || value.length > 180) return false;
  return /^[a-z0-9:_-]+$/i.test(value);
}

function mapAuditLog(doc: {
  _id: { toString(): string };
  action: AdminAuditLog['action'];
  walletAddress: string;
  actor: string;
  createdAt: Date;
  metadata?: AdminAuditLog['metadata'];
}): AdminAuditLog {
  return {
    id: doc._id.toString(),
    action: doc.action,
    walletAddress: doc.walletAddress,
    actor: doc.actor,
    createdAt: doc.createdAt.toISOString(),
    metadata: doc.metadata,
  };
}

function mapApplication(doc: {
  _id: { toString(): string };
  institutionName: string;
  officialEmail: string;
  website: string;
  accreditationId: string;
  country: string;
  city: string;
  representativeName: string;
  walletAddress: string;
  supportingNotes?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UniversityApplicationRecord {
  return {
    id: doc._id.toString(),
    institutionName: doc.institutionName,
    officialEmail: doc.officialEmail,
    website: doc.website,
    accreditationId: doc.accreditationId,
    country: doc.country,
    city: doc.city,
    representativeName: doc.representativeName,
    walletAddress: doc.walletAddress,
    supportingNotes: doc.supportingNotes,
    status: doc.status,
    reviewedBy: doc.reviewedBy,
    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
    reviewNote: doc.reviewNote,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listAllowedIssuers() {
  await connectMongo();
  const issuers = await IssuerModel.find({ approved: true }).sort({ approvedAt: -1 }).lean();
  return issuers.map((issuer) => issuer.walletAddress as string);
}

export async function isIssuerAllowed(walletAddress: string): Promise<boolean> {
  await connectMongo();
  const normalized = normalizeWalletAddress(walletAddress);
  const found = await IssuerModel.findOne({ walletAddress: normalized, approved: true }).lean();
  return Boolean(found);
}

export async function addAllowedIssuer(walletAddress: string, actor: string) {
  await connectMongo();
  const normalized = normalizeWalletAddress(walletAddress);
  if (!isWalletAddressLikelyValid(normalized)) {
    throw new Error('Invalid wallet address format.');
  }

  await IssuerModel.findOneAndUpdate(
    { walletAddress: normalized },
    {
      walletAddress: normalized,
      approved: true,
      approvedBy: actor,
      approvedAt: new Date(),
      source: 'manual',
    },
    { upsert: true, new: true },
  );

  await appendAuditLog({
    action: 'allow_issuer',
    walletAddress: normalized,
    actor,
  });

  return listAllowedIssuers();
}

export async function removeAllowedIssuer(walletAddress: string, actor: string) {
  await connectMongo();
  const normalized = normalizeWalletAddress(walletAddress);

  await IssuerModel.deleteOne({ walletAddress: normalized });
  await appendAuditLog({
    action: 'remove_issuer',
    walletAddress: normalized,
    actor,
  });

  return listAllowedIssuers();
}

export async function appendAuditLog(entry: Omit<AdminAuditLog, 'id' | 'createdAt'>) {
  await connectMongo();
  await AuditLogModel.create({
    action: entry.action,
    walletAddress: normalizeWalletAddress(entry.walletAddress),
    actor: entry.actor,
    metadata: entry.metadata ?? null,
  });
}

export async function listAuditLogs() {
  await connectMongo();
  const logs = await AuditLogModel.find().sort({ createdAt: -1 }).limit(200).lean();
  return logs.map((log) =>
    mapAuditLog(log as Parameters<typeof mapAuditLog>[0]),
  );
}

function validateApplicationInput(input: UniversityApplicationInput) {
  const required: Array<keyof UniversityApplicationInput> = [
    'institutionName',
    'officialEmail',
    'website',
    'accreditationId',
    'country',
    'city',
    'representativeName',
    'walletAddress',
  ];

  for (const key of required) {
    if (!String(input[key] ?? '').trim()) {
      throw new Error(`Missing required field: ${key}`);
    }
  }

  if (!/.+@.+\..+/.test(input.officialEmail)) {
    throw new Error('Please provide a valid official email address.');
  }

  if (!/^https?:\/\//i.test(input.website)) {
    throw new Error('Website must start with http:// or https://');
  }

  if (!isWalletAddressLikelyValid(input.walletAddress)) {
    throw new Error('Invalid wallet address format.');
  }
}

export async function submitUniversityApplication(input: UniversityApplicationInput) {
  await connectMongo();

  const normalizedInput: UniversityApplicationInput = {
    ...input,
    institutionName: input.institutionName.trim(),
    officialEmail: input.officialEmail.trim().toLowerCase(),
    website: input.website.trim().toLowerCase(),
    accreditationId: input.accreditationId.trim(),
    country: input.country.trim(),
    city: input.city.trim(),
    representativeName: input.representativeName.trim(),
    walletAddress: normalizeWalletAddress(input.walletAddress),
    supportingNotes: input.supportingNotes?.trim() ?? '',
  };

  validateApplicationInput(normalizedInput);

  const existingPending = await UniversityApplicationModel.findOne({
    walletAddress: normalizedInput.walletAddress,
    status: 'pending',
  }).lean();

  if (existingPending) {
    throw new Error('A pending application already exists for this wallet.');
  }

  const created = await UniversityApplicationModel.create({
    ...normalizedInput,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  });

  return mapApplication(created.toObject() as Parameters<typeof mapApplication>[0]);
}

export async function listUniversityApplications(status?: 'pending' | 'approved' | 'rejected') {
  await connectMongo();

  const filter = status ? { status } : {};
  const docs = await UniversityApplicationModel.find(filter).sort({ createdAt: -1 }).limit(250).lean();
  return docs.map((doc) => mapApplication(doc as Parameters<typeof mapApplication>[0]));
}

export async function getLatestApplicationByWallet(walletAddress: string) {
  await connectMongo();
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return null;

  const doc = await UniversityApplicationModel.findOne({ walletAddress: normalized })
    .sort({ createdAt: -1 })
    .lean();

  if (!doc) return null;
  return mapApplication(doc as Parameters<typeof mapApplication>[0]);
}

export async function reviewUniversityApplication(params: {
  applicationId: string;
  actor: string;
  decision: 'approved' | 'rejected';
  reviewNote?: string;
}) {
  await connectMongo();

  if (!isValidObjectId(params.applicationId)) {
    throw new Error('Invalid application id.');
  }

  const application = await UniversityApplicationModel.findById(params.applicationId);
  if (!application) {
    throw new Error('Application not found.');
  }

  application.status = params.decision;
  application.reviewedBy = params.actor;
  application.reviewedAt = new Date();
  application.reviewNote = params.reviewNote?.trim() || null;
  await application.save();

  if (params.decision === 'approved') {
    await IssuerModel.findOneAndUpdate(
      { walletAddress: application.walletAddress },
      {
        walletAddress: application.walletAddress,
        approved: true,
        approvedBy: params.actor,
        approvedAt: new Date(),
        source: 'application',
        applicationId: application._id.toString(),
      },
      { upsert: true, new: true },
    );

    await appendAuditLog({
      action: 'approve_application',
      walletAddress: application.walletAddress,
      actor: params.actor,
      metadata: {
        applicationId: application._id.toString(),
        institutionName: application.institutionName,
        reviewNote: application.reviewNote ?? undefined,
      },
    });
  } else {
    await IssuerModel.deleteOne({ walletAddress: application.walletAddress });
    await appendAuditLog({
      action: 'reject_application',
      walletAddress: application.walletAddress,
      actor: params.actor,
      metadata: {
        applicationId: application._id.toString(),
        institutionName: application.institutionName,
        reviewNote: application.reviewNote ?? undefined,
      },
    });
  }

  return mapApplication(application.toObject() as Parameters<typeof mapApplication>[0]);
}
