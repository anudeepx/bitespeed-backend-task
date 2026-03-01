import { ContactRepositoryPort } from '../repositories/contactRepository';
import { ContactRecord, IdentifyResponse } from '../types/contact';

export class IdentityService {
    constructor(private readonly contactRepository: ContactRepositoryPort) { }

    async identify(input: { email?: string | null; phoneNumber?: string | null }): Promise<IdentifyResponse> {
        const normalizedEmail = normalizeEmail(input.email);
        const normalizedPhone = normalizePhone(input.phoneNumber);

        return this.contactRepository.withTransaction(async (client) => {
            const directMatches = await this.contactRepository.findDirectMatches(client, normalizedEmail, normalizedPhone);

            if (directMatches.length === 0) {
                const createdPrimary = await this.contactRepository.createContact(client, {
                    email: normalizedEmail,
                    phoneNumber: normalizedPhone,
                    linkPrecedence: 'primary',
                    linkedId: null,
                });

                return buildResponse([createdPrimary], createdPrimary.id);
            }

            const primaryIdsFromMatches = unique(
                directMatches.map((contact) => (contact.linkPrecedence === 'primary' ? contact.id : contact.linkedId)).filter(Boolean) as number[]
            );

            let entireTree = await this.contactRepository.findTreeByPrimaryIds(client, primaryIdsFromMatches);

            const primaries = sortByAge(entireTree.filter((contact) => contact.linkPrecedence === 'primary'));
            const canonicalPrimary = primaries[0];

            if (!canonicalPrimary) {
                throw new Error('Inconsistent contact graph: no primary found');
            }

            const primariesToConvert = primaries.filter((primary) => primary.id !== canonicalPrimary.id);
            for (const convertCandidate of primariesToConvert) {
                await this.contactRepository.convertPrimaryToSecondary(client, convertCandidate.id, canonicalPrimary.id);
            }

            if (primariesToConvert.length > 0) {
                const mergedPrimaryIds = unique([canonicalPrimary.id, ...primariesToConvert.map((contact) => contact.id)]);
                entireTree = await this.contactRepository.findTreeByPrimaryIds(client, mergedPrimaryIds);
            }

            const hasEmail = normalizedEmail != null && entireTree.some((contact) => contact.email === normalizedEmail);
            const hasPhone = normalizedPhone != null && entireTree.some((contact) => contact.phoneNumber === normalizedPhone);
            const exactExists = hasExactContact(entireTree, normalizedEmail, normalizedPhone);

            const shouldCreateSecondary =
                !exactExists &&
                ((normalizedEmail != null && !hasEmail) ||
                    (normalizedPhone != null && !hasPhone) ||
                    (normalizedEmail != null && normalizedPhone != null && hasEmail && hasPhone));

            if (shouldCreateSecondary) {
                await this.contactRepository.createContact(client, {
                    email: normalizedEmail,
                    phoneNumber: normalizedPhone,
                    linkPrecedence: 'secondary',
                    linkedId: canonicalPrimary.id,
                });
            }

            const finalTree = await this.contactRepository.findTreeByPrimaryIds(client, [canonicalPrimary.id]);
            return buildResponse(finalTree, canonicalPrimary.id);
        });
    }
}

function normalizeEmail(email?: string | null): string | null {
    if (email == null) {
        return null;
    }
    const trimmed = email.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(phoneNumber?: string | null): string | null {
    if (phoneNumber == null) {
        return null;
    }
    const trimmed = phoneNumber.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

function sortByAge(contacts: ContactRecord[]): ContactRecord[] {
    return [...contacts].sort((a, b) => {
        const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
        if (byCreatedAt !== 0) {
            return byCreatedAt;
        }
        return a.id - b.id;
    });
}

function hasExactContact(contacts: ContactRecord[], email: string | null, phone: string | null): boolean {
    if (email == null && phone == null) {
        return true;
    }

    if (email != null && phone != null) {
        return contacts.some((contact) => contact.email === email && contact.phoneNumber === phone);
    }

    if (email != null) {
        return contacts.some((contact) => contact.email === email);
    }

    return contacts.some((contact) => contact.phoneNumber === phone);
}

function buildResponse(contacts: ContactRecord[], primaryId: number): IdentifyResponse {
    const primary = contacts.find((contact) => contact.id === primaryId);
    if (!primary) {
        throw new Error('Primary not found in contact tree');
    }

    const sortedContacts = sortByAge(contacts);
    const emails: string[] = [];
    const phoneNumbers: string[] = [];

    const orderedForIdentity = [primary, ...sortedContacts.filter((contact) => contact.id !== primary.id)];

    for (const contact of orderedForIdentity) {
        if (contact.email != null && !emails.includes(contact.email)) {
            emails.push(contact.email);
        }
        if (contact.phoneNumber != null && !phoneNumbers.includes(contact.phoneNumber)) {
            phoneNumbers.push(contact.phoneNumber);
        }
    }

    return {
        contact: {
            primaryContatctId: primary.id,
            emails,
            phoneNumbers,
            secondaryContactIds: sortedContacts
                .filter((contact) => contact.linkPrecedence === 'secondary')
                .map((contact) => contact.id),
        },
    };
}
