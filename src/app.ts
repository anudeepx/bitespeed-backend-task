import express from 'express';
import { IdentifyController } from './controllers/identifyController';
import { ContactRepository } from './repositories/contactRepository';
import { IdentityService } from './services/identityService';

export function createApp(): express.Express {
    const app = express();
    app.use(express.json());

    const repository = new ContactRepository();
    const identityService = new IdentityService(repository);
    const identifyController = new IdentifyController(identityService);

    app.post('/identify', identifyController.identify);

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok' });
    });

    return app;
}
