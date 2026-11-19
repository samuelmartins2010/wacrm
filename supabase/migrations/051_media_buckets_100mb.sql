-- 051_media_buckets_100mb.sql
-- F7: a Meta aceita documentos de até 100 MB. Os buckets usados pelos
-- fluxos e pelo inbox passam a aceitar até 100 MB; o limite por tipo
-- (imagem 5 MB, vídeo/áudio 16 MB, documento 100 MB) é checado na tela
-- antes do upload (src/lib/storage/upload-media.ts).
UPDATE storage.buckets
   SET file_size_limit = 104857600
 WHERE id IN ('flow-media', 'chat-media');
