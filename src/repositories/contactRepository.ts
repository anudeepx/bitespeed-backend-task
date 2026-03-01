import { PoolClient, QueryResult } from 'pg';
import { pool } from '../db/pool';
import { ContactRecord } from '../types/contact';

export interface ContactRepositoryPort {
    withTransaction<T>(fn: (client: unknown) => Promise<T>): Promise<T>;
    findDirectMatches(client: unknown, email: string | null, phoneNumber: string | null): Promise<ContactRecord[]>;
    findTreeByPrimaryIds(client: unknown, primaryIds: number[]): Promise<ContactRecord[]>;
    createContact(client: unknown, input: NewContactInput): Promise<ContactRecord>;
    convertPrimaryToSecondary(client: unknown, primaryIdToConvert: number, canonicalPrimaryId: number): Promise<void>;
}

export interface NewContactInput {
    email: string | null;
    phoneNumber: string | null;
    linkPrecedence: 'primary' | 'secondary';
    linkedId: number | null;
}

function mapContact(row: Record<string, unknown>): ContactRecord {
    return {
        id: Number(row.id),
        phoneNumber: (row.phone_number as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        linkedId: row.linked_id == null ? null : Number(row.linked_id),
        linkPrecedence: row.link_precedence as 'primary' | 'secondary',
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        deletedAt: row.deleted_at == null ? null : new Date(row.deleted_at as string),
    };
}

export class ContactRepository implements ContactRepositoryPort {
    async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async findDirectMatches(
        client: PoolClient,
        email: string | null,
        phoneNumber: string | null
    ): Promise<ContactRecord[]> {
        if (email == null && phoneNumber == null) {
            return [];
        }

        const clauses: string[] = ['deleted_at IS NULL'];
        const values: Array<string> = [];

        if (email != null) {
            values.push(email);
            clauses.push(`email = $${values.length}`);
        }

        if (phoneNumber != null) {
            values.push(phoneNumber);
            clauses.push(`phone_number = $${values.length}`);
        }

        const orClause = clauses.filter((c) => c.startsWith('email') || c.startsWith('phone_number')).join(' OR ');

        const query = `
      SELECT *
      FROM contacts
      WHERE deleted_at IS NULL
      AND (${orClause})
      ORDER BY created_at ASC, id ASC
    `;

        const result = await client.query(query, values);
        return result.rows.map(mapContact);
    }

    async findTreeByPrimaryIds(client: PoolClient, primaryIds: number[]): Promise<ContactRecord[]> {
        if (primaryIds.length === 0) {
            return [];
        }

        const query = `
      SELECT *
      FROM contacts
      WHERE deleted_at IS NULL
      AND (id = ANY($1::bigint[]) OR linked_id = ANY($1::bigint[]))
      ORDER BY created_at ASC, id ASC
    `;

        const result = await client.query(query, [primaryIds]);
        return result.rows.map(mapContact);
    }

    async createContact(client: PoolClient, input: NewContactInput): Promise<ContactRecord> {
        const query = `
      INSERT INTO contacts (phone_number, email, linked_id, link_precedence)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

        const result: QueryResult = await client.query(query, [
            input.phoneNumber,
            input.email,
            input.linkedId,
            input.linkPrecedence,
        ]);

        return mapContact(result.rows[0]);
    }

    async convertPrimaryToSecondary(
        client: PoolClient,
        primaryIdToConvert: number,
        canonicalPrimaryId: number
    ): Promise<void> {
        await client.query(
            `
      UPDATE contacts
      SET link_precedence = 'secondary', linked_id = $1
      WHERE id = $2 AND deleted_at IS NULL
      `,
            [canonicalPrimaryId, primaryIdToConvert]
        );

        await client.query(
            `
      UPDATE contacts
      SET linked_id = $1
      WHERE linked_id = $2 AND deleted_at IS NULL
      `,
            [canonicalPrimaryId, primaryIdToConvert]
        );
    }
}
