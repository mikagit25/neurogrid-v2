import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { authenticate } from '../auth/auth.middleware';

const UPLOAD_DIR = path.join(__dirname, '../../../public/images/uploads');
const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `upload-${crypto.randomBytes(12).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Неподдерживаемый формат. Разрешены: JPG, PNG, WebP`));
    }
  },
});

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);

uploadsRouter.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'Файл не получен' });
    return;
  }
  const url = `${process.env.APP_URL}/images/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

uploadsRouter.use((err: any, _req: Request, res: Response, _next: any) => {
  res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
});
