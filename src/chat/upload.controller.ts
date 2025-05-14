import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('upload')
export class UploadController {
  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + extname(file.originalname));
      },
    }),
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'video/mp4'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type'), false);
      }
    },
  }))
  uploadFile(@UploadedFile() file: any) {
    return { url: `/uploads/files/${file.filename}`, mimetype: file.mimetype };
  }
}
