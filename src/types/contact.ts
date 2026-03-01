export type LinkPrecedence = 'primary' | 'secondary';

export interface ContactRecord {
    id: number;
    phoneNumber: string | null;
    email: string | null;
    linkedId: number | null;
    linkPrecedence: LinkPrecedence;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

export interface IdentifyRequest {
    email?: string | null;
    phoneNumber?: string | null;
}

export interface IdentifyContactPayload {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
}

export interface IdentifyResponse {
    contact: IdentifyContactPayload;
}
