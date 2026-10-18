import { Client, Storage, ID } from 'node-appwrite';
export function storageClient() {
  const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID } = process.env;
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY || !APPWRITE_BUCKET_ID) throw new Error('Appwrite storage is not configured');
  const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
  return { storage: new Storage(client), bucket: APPWRITE_BUCKET_ID };
}
export { ID };
