import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: process.env.MINIO_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
  });
  return client;
}

function bucket(): string {
  const b = process.env.MINIO_BUCKET_EXAMES;
  if (!b) throw new Error("MINIO_BUCKET_EXAMES nao configurado");
  return b;
}

export async function uploadExamPdf(
  key: string,
  body: Buffer,
  contentType = "application/pdf",
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function readExamPdf(key: string): Promise<Buffer> {
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export function buildExamKey(clinicId: string, examId: string): string {
  return `clinics/${clinicId}/exams/${examId}.pdf`;
}
