import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { IdentityService } from '../services/identityService';
import { identifyRequestSchema } from '../types/identify';

export class IdentifyController {
    constructor(private readonly identityService: IdentityService) { }

    identify = async (req: Request, res: Response): Promise<void> => {
        try {
            const parsed = identifyRequestSchema.parse(req.body ?? {});
            const response = await this.identityService.identify({
                email: parsed.email ?? null,
                phoneNumber: parsed.phoneNumber ?? null,
            });
            res.status(200).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    message: 'Invalid request body',
                    errors: error.issues.map((issue) => ({
                        path: issue.path.join('.'),
                        message: issue.message,
                    })),
                });
                return;
            }

            const databaseError = error as { code?: string; message?: string };
            if (databaseError.code === '28P01') {
                res.status(503).json({ message: 'Database authentication failed. Check DATABASE_URL credentials.' });
                return;
            }

            if (databaseError.code === '3D000') {
                res.status(503).json({ message: 'Database does not exist. Create the database configured in DATABASE_URL.' });
                return;
            }

            if (databaseError.code === '42P01') {
                res.status(503).json({ message: 'Database schema missing. Run db/schema.sql before testing.' });
                return;
            }

            console.error('Identify endpoint failed:', databaseError.message ?? error);

            res.status(500).json({
                message: 'Internal server error',
            });
        }
    };
}
