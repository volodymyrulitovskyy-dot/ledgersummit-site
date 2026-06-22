'use client'

import { useState } from 'react'
import { uploadTbCsvAction } from './tb/actions'

interface TrialBalanceUploadProps {
  orgId: string
  rangeFromDate: string
  rangeToDate: string
  hasSnapshot: boolean
  snapshotImportedAt: Date | string | null
}

export function TrialBalanceUpload({
  orgId,
  rangeFromDate,
  rangeToDate,
  hasSnapshot,
  snapshotImportedAt,
}: TrialBalanceUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
      setSuccess(null)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please select a file')
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const content = await file.text()
      const result = await uploadTbCsvAction(orgId, rangeFromDate, rangeToDate, content)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(`Successfully imported ${result.rowsImported} rows`)
        setFile(null)
        // Reset file input
        const input = document.getElementById('tb-csv-input') as HTMLInputElement
        if (input) input.value = ''
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload CSV')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Trial Balance</h2>

      {hasSnapshot && snapshotImportedAt && (
        <div className="mb-4 rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-800">
            TB snapshot exists (imported {new Date(snapshotImportedAt).toLocaleString()})
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <label htmlFor="tb-csv-input" className="block text-sm font-medium text-gray-700 mb-2">
            Upload TB CSV
          </label>
          <input
            id="tb-csv-input"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            CSV must include: account_name (required), balance (required). Optional: account_number, debit, credit, account_type
          </p>
        </div>

        <button
          type="submit"
          disabled={isUploading || !file}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isUploading ? 'Uploading...' : 'Upload TB CSV'}
        </button>
      </form>
    </div>
  )
}

