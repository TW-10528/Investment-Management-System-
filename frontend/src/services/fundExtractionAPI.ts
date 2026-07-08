/**
 * Fund Extraction API Service
 * Handles communication with backend for unknown fund extraction and creation
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';

const API_BASE = '/api/v1/funds';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add user email header if available
client.interceptors.request.use((config) => {
  const userEmail = localStorage.getItem('ims_user_email');
  if (userEmail) {
    config.headers['X-User-Email'] = userEmail;
  }
  return config;
});

export const fundExtractionAPI = {
  /**
   * Extract data from PDF for unknown fund
   */
  extractUnknownFund: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API_BASE}/extract-unknown-fund`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  /**
   * Create fund from extracted data
   * This auto-creates the Capital Call/Distribution
   */
  createFromExtraction: async (payload: {
    extractedData: any;
    userEditedFundData: any;
    userEditedDocumentData: any;
    pdfData: {
      fileName: string;
      fileHash: string;
      filePath: string;
    };
    userCorrectedFields: string[];
  }) => {
    const response = await client.post('/create-from-extraction', payload);
    return response.data;
  },
};
