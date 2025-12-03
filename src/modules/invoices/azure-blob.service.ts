import { Injectable, Logger } from '@nestjs/common';
import {
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential
} from '@azure/storage-blob';
import { envs } from 'src/config';

@Injectable()
export class AzureBlobService {
  private readonly logger = new Logger(AzureBlobService.name);
  private readonly containerClient: ContainerClient;
  private readonly accountName: string;
  private readonly accountKey: string;

  constructor() {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      envs.azureStorageConnectionString
    );

    this.containerClient = blobServiceClient.getContainerClient(envs.documentsContainerName);

    // Extraer accountName y accountKey del connection string para SAS tokens
    const connStrMatch = envs.azureStorageConnectionString.match(
      /AccountName=([^;]+).*AccountKey=([^;]+)/
    );

    if (connStrMatch) {
      this.accountName = connStrMatch[1];
      this.accountKey = connStrMatch[2];
    } else {
      throw new Error('Invalid Azure Storage connection string format');
    }

    this.logger.log('✅ Azure Blob Service initialized');
  }

  /**
   * Genera URL temporal con SAS token para acceso seguro
   * @param expiresInHours - Horas de validez del link (default: 24h)
   */
  async getDocumentUrl(blobName: string, expiresInHours: number = 24): Promise<string> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      const sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerClient.containerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          startsOn: new Date(),
          expiresOn: new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
        },
        sharedKeyCredential
      ).toString();

      return `${blockBlobClient.url}?${sasToken}`;
    } catch (error) {
      this.logger.error(`Failed to generate SAS URL for blob: ${blobName}`, error);
      throw error;
    }
  }

  /**
   * Genera múltiples URLs para exportación masiva
   * Optimizado para lotes grandes
   */
  async getMultipleDocumentUrls(
    blobNames: string[],
    expiresInHours: number = 48
  ): Promise<Map<string, string>> {
    const urls = new Map<string, string>();

    // Procesar en paralelo (máximo 50 a la vez para no saturar)
    const batchSize = 50;
    for (let i = 0; i < blobNames.length; i += batchSize) {
      const batch = blobNames.slice(i, i + batchSize);
      const batchUrls = await Promise.all(
        batch.map(async (blobName) => {
          try {
            const url = await this.getDocumentUrl(blobName, expiresInHours);
            return { blobName, url };
          } catch (error) {
            this.logger.warn(`Failed to generate URL for ${blobName}:`, error);
            return { blobName, url: null };
          }
        })
      );

      batchUrls.forEach(({ blobName, url }) => {
        if (url) urls.set(blobName, url);
      });
    }

    this.logger.log(`📦 Generated ${urls.size}/${blobNames.length} URLs for export`);
    return urls;
  }

  async documentExists(blobName: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      this.logger.error(`Failed to check document existence: ${blobName}`, error);
      return false;
    }
  }

  /**
   * Elimina un documento del blob storage
   */
  async deleteDocument(blobName: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const exists = await blockBlobClient.exists();

      if (!exists) {
        this.logger.warn(`Blob ${blobName} does not exist, skipping deletion`);
        return false;
      }

      await blockBlobClient.delete();
      this.logger.log(`🗑️  Blob deleted: ${blobName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete blob: ${blobName}`, error);
      throw error;
    }
  }
}
