import { ContactRepositoryPort, NewContactInput } from '../src/repositories/contactRepository';
import { IdentityService } from '../src/services/identityService';
import { ContactRecord } from '../src/types/contact';

class InMemoryContactRepository implements ContactRepositoryPort {
    private contacts: ContactRecord[];
    private nextId: number;

    constructor(seed: ContactRecord[] = []) {
        this.contacts = [...seed].sort((a, b) => a.id - b.id);
        this.nextId = seed.length > 0 ? Math.max(...seed.map((contact) => contact.id)) + 1 : 1;
    }

    async withTransaction<T>(fn: (client: unknown) => Promise<T>): Promise<T> {
        return fn({});
    }

    async findDirectMatches(_client: unknown, email: string | null, phoneNumber: string | null): Promise<ContactRecord[]> {
        return this.contacts
            .filter((contact) => contact.deletedAt == null)
            .filter((contact) => {
                if (email == null && phoneNumber == null) {
                    return false;
                }
                return contact.email === email || contact.phoneNumber === phoneNumber;
            })
            .sort(byAge);
    }

    async findTreeByPrimaryIds(_client: unknown, primaryIds: number[]): Promise<ContactRecord[]> {
        return this.contacts
            .filter((contact) => contact.deletedAt == null)
            .filter((contact) => primaryIds.includes(contact.id) || (contact.linkedId != null && primaryIds.includes(contact.linkedId)))
            .sort(byAge);
    }

    async createContact(_client: unknown, input: NewContactInput): Promise<ContactRecord> {
        const now = new Date();
        const created: ContactRecord = {
            id: this.nextId++,
            email: input.email,
            phoneNumber: input.phoneNumber,
            linkedId: input.linkedId,
            linkPrecedence: input.linkPrecedence,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        this.contacts.push(created);
        return created;
    }

    async convertPrimaryToSecondary(
        _client: unknown,
        primaryIdToConvert: number,
        canonicalPrimaryId: number
    ): Promise<void> {
        this.contacts = this.contacts.map((contact) => {
            if (contact.id === primaryIdToConvert) {
                return {
                    ...contact,
                    linkPrecedence: 'secondary',
                    linkedId: canonicalPrimaryId,
                    updatedAt: new Date(),
                };
            }
            if (contact.linkedId === primaryIdToConvert) {
                return {
                    ...contact,
                    linkedId: canonicalPrimaryId,
                    updatedAt: new Date(),
                };
            }
            return contact;
        });
    }
}

function byAge(a: ContactRecord, b: ContactRecord): number {
    const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
    if (byCreatedAt !== 0) {
        return byCreatedAt;
    }
    return a.id - b.id;
}

function makeContact(input: Partial<ContactRecord> & Pick<ContactRecord, 'id'>): ContactRecord {
    const createdAt = input.createdAt ?? new Date(input.id * 1000);
    return {
        id: input.id,
        email: input.email ?? null,
        phoneNumber: input.phoneNumber ?? null,
        linkedId: input.linkedId ?? null,
        linkPrecedence: input.linkPrecedence ?? 'primary',
        createdAt,
        updatedAt: input.updatedAt ?? createdAt,
        deletedAt: input.deletedAt ?? null,
    };
}

describe('IdentityService', () => {
    it('creates a new primary contact when no match exists', async () => {
        const repository = new InMemoryContactRepository();
        const service = new IdentityService(repository);

        const result = await service.identify({ email: 'alice@example.com', phoneNumber: '111' });

        expect(result).toEqual({
            contact: {
                primaryContatctId: 1,
                emails: ['alice@example.com'],
                phoneNumbers: ['111'],
                secondaryContactIds: [],
            },
        });
    });

    it('creates secondary contact when new information appears in existing tree', async () => {
        const repository = new InMemoryContactRepository([
            makeContact({ id: 1, email: 'alice@example.com', phoneNumber: '111', linkPrecedence: 'primary' }),
        ]);
        const service = new IdentityService(repository);

        const result = await service.identify({ email: 'alice@example.com', phoneNumber: '222' });

        expect(result.contact.primaryContatctId).toBe(1);
        expect(result.contact.emails).toEqual(['alice@example.com']);
        expect(result.contact.phoneNumbers).toEqual(['111', '222']);
        expect(result.contact.secondaryContactIds).toEqual([2]);
    });

    it('merges two primaries and keeps oldest as primary', async () => {
        const repository = new InMemoryContactRepository([
            makeContact({ id: 1, email: 'old@example.com', phoneNumber: '111', linkPrecedence: 'primary', createdAt: new Date('2024-01-01') }),
            makeContact({ id: 2, email: 'new@example.com', phoneNumber: '222', linkPrecedence: 'primary', createdAt: new Date('2024-02-01') }),
        ]);
        const service = new IdentityService(repository);

        const result = await service.identify({ email: 'old@example.com', phoneNumber: '222' });

        expect(result.contact.primaryContatctId).toBe(1);
        expect(result.contact.secondaryContactIds).toContain(2);
        expect(result.contact.emails).toEqual(['old@example.com', 'new@example.com']);
        expect(result.contact.phoneNumbers).toEqual(['111', '222']);
    });

    it('is idempotent for repeated identical requests', async () => {
        const repository = new InMemoryContactRepository();
        const service = new IdentityService(repository);

        const first = await service.identify({ email: 'repeat@example.com', phoneNumber: '444' });
        const second = await service.identify({ email: 'repeat@example.com', phoneNumber: '444' });

        expect(first).toEqual(second);
        expect(second.contact.secondaryContactIds).toEqual([]);
    });

    it('handles null field cases (only email or only phone)', async () => {
        const repository = new InMemoryContactRepository();
        const service = new IdentityService(repository);

        const onlyEmail = await service.identify({ email: 'solo@example.com', phoneNumber: null });
        const onlyPhone = await service.identify({ email: null, phoneNumber: '999' });

        expect(onlyEmail.contact.emails).toEqual(['solo@example.com']);
        expect(onlyEmail.contact.phoneNumbers).toEqual([]);
        expect(onlyPhone.contact.emails).toEqual([]);
        expect(onlyPhone.contact.phoneNumbers).toEqual(['999']);
    });
});
