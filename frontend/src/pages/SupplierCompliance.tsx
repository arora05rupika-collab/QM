import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { suppliersApi, rawMaterialDocsApi } from '../services/api'
import toast from 'react-hot-toast'
import {
  Users, FileText, Plus, Send, Trash2, Download, Bell, Edit2, X, Check,
  ChevronDown, AlertTriangle, Package
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type VendorType = 'preferred' | 'alternative'
type SupplierStatus =
  | 'under_review'
  | 'sent_request'
  | 'under_process'
  | 'rejected_with_comments'
  | 'accepted_with_comments'

interface Supplier {
  id: string
  name: string
  raw_materials: string[]
  contact_email: string
  vendor_type: VendorType
  status: SupplierStatus
  comments?: string
  created_at: string
}

interface RawMaterialDoc {
  id: string
  supplier_id?: string
  supplier_name: string
  file_name: string
  document_type: string
  raw_materials: string[]
  expiry_date?: string
  notification_sent: boolean
  created_at: string
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SupplierStatus, string> = {
  under_review: 'Under Review',
  sent_request: 'Sent Request',
  under_process: 'Under Process',
  rejected_with_comments: 'Rejected',
  accepted_with_comments: 'Accepted',
}

const STATUS_COLORS: Record<SupplierStatus, string> = {
  under_review: 'bg-yellow-900 text-yellow-300',
  sent_request: 'bg-blue-900 text-blue-300',
  under_process: 'bg-purple-900 text-purple-300',
  rejected_with_comments: 'bg-red-900 text-red-300',
  accepted_with_comments: 'bg-green-900 text-green-300',
}

const VENDOR_COLORS: Record<VendorType, string> = {
  preferred: 'bg-emerald-900 text-emerald-300',
  alternative: 'bg-gray-700 text-gray-300',
}

function StatusBadge({ status }: { status: SupplierStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function VendorBadge({ type }: { type: VendorType }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${VENDOR_COLORS[type]}`}>
      {type === 'preferred' ? 'Preferred Supplier' : 'Alternative Supplier'}
    </span>
  )
}

function isExpired(dateStr?: string) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function isExpiringSoon(dateStr?: string) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 30
}

// ─── Add Supplier Modal ───────────────────────────────────────────────────────

function AddSupplierModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    contact_email: '',
    raw_materials: '',
    vendor_type: 'preferred' as VendorType,
    status: 'under_review' as SupplierStatus,
    comments: '',
  })

  const mutation = useMutation({
    mutationFn: () => suppliersApi.create({
      ...form,
      raw_materials: form.raw_materials.split(',').map(m => m.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier added')
      onClose()
    },
    onError: () => toast.error('Failed to add supplier'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Add Supplier</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Supplier Name">
            <input
              className="input"
              placeholder="Acme Corp"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Contact Email">
            <input
              className="input"
              type="email"
              placeholder="contact@acme.com"
              value={form.contact_email}
              onChange={e => setForm({ ...form, contact_email: e.target.value })}
            />
          </Field>
          <Field label="Raw Materials Supplied" hint="Comma-separated">
            <input
              className="input"
              placeholder="Steel, Copper, Aluminum"
              value={form.raw_materials}
              onChange={e => setForm({ ...form, raw_materials: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor Type">
              <select
                className="input"
                value={form.vendor_type}
                onChange={e => setForm({ ...form, vendor_type: e.target.value as VendorType })}
              >
                <option value="preferred">Preferred Supplier</option>
                <option value="alternative">Alternative Supplier</option>
              </select>
            </Field>
            <Field label="Initial Status">
              <select
                className="input"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value as SupplierStatus })}
              >
                <option value="under_review">Under Review</option>
                <option value="sent_request">Sent Request</option>
                <option value="under_process">Under Process</option>
                <option value="rejected_with_comments">Rejected</option>
                <option value="accepted_with_comments">Accepted</option>
              </select>
            </Field>
          </div>
          <Field label="Comments (optional)">
            <textarea
              className="input h-20 resize-none"
              placeholder="Notes about this supplier..."
              value={form.comments}
              onChange={e => setForm({ ...form, comments: e.target.value })}
            />
          </Field>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name || !form.contact_email || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Adding…' : 'Add Supplier'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Status Modal ────────────────────────────────────────────────────────

function EditStatusModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<SupplierStatus>(supplier.status)
  const [comments, setComments] = useState(supplier.comments || '')

  const mutation = useMutation({
    mutationFn: () => suppliersApi.update(supplier.id, { status, comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Status updated')
      onClose()
    },
    onError: () => toast.error('Failed to update'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Update Status – {supplier.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Submission Status">
            <select
              className="input"
              value={status}
              onChange={e => setStatus(e.target.value as SupplierStatus)}
            >
              <option value="under_review">Under Review</option>
              <option value="sent_request">Sent Request</option>
              <option value="under_process">Under Process</option>
              <option value="rejected_with_comments">Rejected with Comments</option>
              <option value="accepted_with_comments">Accepted with Comments</option>
            </select>
          </Field>
          <Field label="Comments">
            <textarea
              className="input h-24 resize-none"
              placeholder="Add notes or comments about this status change..."
              value={comments}
              onChange={e => setComments(e.target.value)}
            />
          </Field>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload Document Modal ────────────────────────────────────────────────────

function UploadDocModal({ suppliers, onClose }: { suppliers: Supplier[]; onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    document_type: '',
    raw_materials: '',
    expiry_date: '',
  })
  const [file, setFile] = useState<File | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file')
      const fd = new FormData()
      fd.append('file', file)
      if (form.supplier_id) fd.append('supplier_id', form.supplier_id)
      fd.append('supplier_name', form.supplier_name)
      fd.append('document_type', form.document_type)
      fd.append('raw_materials', form.raw_materials)
      if (form.expiry_date) fd.append('expiry_date', form.expiry_date)
      return rawMaterialDocsApi.upload(fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document uploaded')
      onClose()
    },
    onError: () => toast.error('Upload failed'),
  })

  const handleSupplierChange = (id: string) => {
    const s = suppliers.find(s => s.id === id)
    setForm({ ...form, supplier_id: id, supplier_name: s?.name || form.supplier_name })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Upload Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Supplier">
            <select
              className="input"
              value={form.supplier_id}
              onChange={e => handleSupplierChange(e.target.value)}
            >
              <option value="">— Select supplier —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          {!form.supplier_id && (
            <Field label="Supplier Name (if not listed)">
              <input
                className="input"
                placeholder="Supplier name"
                value={form.supplier_name}
                onChange={e => setForm({ ...form, supplier_name: e.target.value })}
              />
            </Field>
          )}
          <Field label="Document Type">
            <input
              className="input"
              placeholder="e.g. Certificate of Analysis, MSDS, CoC..."
              value={form.document_type}
              onChange={e => setForm({ ...form, document_type: e.target.value })}
            />
          </Field>
          <Field label="Associated Raw Materials" hint="Comma-separated">
            <input
              className="input"
              placeholder="Steel, Copper"
              value={form.raw_materials}
              onChange={e => setForm({ ...form, raw_materials: e.target.value })}
            />
          </Field>
          <Field label="Expiry Date (optional)">
            <input
              className="input"
              type="date"
              value={form.expiry_date}
              onChange={e => setForm({ ...form, expiry_date: e.target.value })}
            />
          </Field>
          <Field label="File">
            <div
              className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-600 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center gap-2 justify-center text-green-400">
                  <Check className="w-4 h-4" />
                  <span className="text-sm">{file.name}</span>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                  Click to select a file
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
          </Field>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!file || !form.document_type || (!form.supplier_id && !form.supplier_name) || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared form helpers ──────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1.5">
        {label} {hint && <span className="text-gray-600">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Suppliers Tab ────────────────────────────────────────────────────────────

function SuppliersTab() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: suppliersApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => suppliersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Supplier deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const sendRequestMutation = useMutation({
    mutationFn: (id: string) => suppliersApi.sendRequest(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success(data.email_sent ? 'Request email sent!' : 'Status updated (configure SMTP to send emails)')
    },
    onError: () => toast.error('Failed to send request'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Suppliers</h2>
          <p className="text-sm text-gray-400 mt-0.5">Manage supplier details, vendor type, and submission status</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No suppliers yet</p>
          <p className="text-gray-600 text-sm mt-1">Click "Add Supplier" to get started</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Supplier</th>
                <th className="text-left px-5 py-3 font-medium">Raw Materials</th>
                <th className="text-left px-5 py-3 font-medium">Contact Email</th>
                <th className="text-left px-5 py-3 font-medium">Vendor Type</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Comments</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {suppliers.map(s => (
                <tr key={s.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-medium text-white">{s.name}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {s.raw_materials.length > 0 ? s.raw_materials.map((m, i) => (
                        <span key={i} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">{m}</span>
                      )) : <span className="text-gray-600">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-300">{s.contact_email}</td>
                  <td className="px-5 py-4"><VendorBadge type={s.vendor_type} /></td>
                  <td className="px-5 py-4"><StatusBadge status={s.status} /></td>
                  <td className="px-5 py-4 text-gray-400 max-w-xs">
                    <span className="truncate block">{s.comments || '—'}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => sendRequestMutation.mutate(s.id)}
                        disabled={sendRequestMutation.isPending}
                        title="Send request to supplier"
                        className="flex items-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-blue-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Send className="w-3 h-3" />
                        Send Request
                      </button>
                      <button
                        onClick={() => setEditSupplier(s)}
                        title="Update status"
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(s.id)}
                        title="Delete supplier"
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddSupplierModal onClose={() => setShowAdd(false)} />}
      {editSupplier && <EditStatusModal supplier={editSupplier} onClose={() => setEditSupplier(null)} />}
    </div>
  )
}

// ─── Raw Material Docs Tab ────────────────────────────────────────────────────

function RawMaterialDocsTab() {
  const qc = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)

  const { data: docs = [], isLoading } = useQuery<RawMaterialDoc[]>({
    queryKey: ['documents'],
    queryFn: rawMaterialDocsApi.list,
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: suppliersApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rawMaterialDocsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Document deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const checkExpiryMutation = useMutation({
    mutationFn: rawMaterialDocsApi.checkExpiry,
    onSuccess: (data) => toast.success(`Checked ${data.checked} docs. Notified: ${data.notified.length}`),
    onError: () => toast.error('Check failed'),
  })

  const expiredCount = docs.filter(d => isExpired(d.expiry_date)).length
  const soonCount = docs.filter(d => isExpiringSoon(d.expiry_date)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Raw Material Documents</h2>
          <p className="text-sm text-gray-400 mt-0.5">All supplier compliance documents in one place</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => checkExpiryMutation.mutate()}
            disabled={checkExpiryMutation.isPending}
            className="flex items-center gap-2 bg-orange-900 hover:bg-orange-800 text-orange-300 text-sm px-3 py-2 rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            {checkExpiryMutation.isPending ? 'Checking…' : 'Check Expiry & Notify'}
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      </div>

      {(expiredCount > 0 || soonCount > 0) && (
        <div className="flex gap-3 mb-5">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 bg-red-900/40 border border-red-800 text-red-300 text-sm px-4 py-2.5 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
              {expiredCount} document{expiredCount > 1 ? 's' : ''} expired
            </div>
          )}
          {soonCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-900/40 border border-yellow-800 text-yellow-300 text-sm px-4 py-2.5 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
              {soonCount} expiring within 30 days
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No documents yet</p>
          <p className="text-gray-600 text-sm mt-1">Upload supplier compliance documents here</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">File Name</th>
                <th className="text-left px-5 py-3 font-medium">Document Type</th>
                <th className="text-left px-5 py-3 font-medium">Raw Materials</th>
                <th className="text-left px-5 py-3 font-medium">Expiry Date</th>
                <th className="text-left px-5 py-3 font-medium">Supplier</th>
                <th className="text-left px-5 py-3 font-medium">Notified</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {docs.map(d => {
                const expired = isExpired(d.expiry_date)
                const soon = isExpiringSoon(d.expiry_date)
                return (
                  <tr key={d.id} className={`hover:bg-gray-800/50 transition-colors ${expired ? 'bg-red-900/10' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="text-white font-medium truncate max-w-[180px]">{d.file_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-300">{d.document_type}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {d.raw_materials.length > 0 ? d.raw_materials.map((m, i) => (
                          <span key={i} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">{m}</span>
                        )) : <span className="text-gray-600">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {d.expiry_date ? (
                        <span className={`text-sm font-medium ${expired ? 'text-red-400' : soon ? 'text-yellow-400' : 'text-gray-300'}`}>
                          {expired && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                          {d.expiry_date}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-300">{d.supplier_name}</td>
                    <td className="px-5 py-4">
                      {d.notification_sent ? (
                        <span className="flex items-center gap-1 text-green-400 text-xs"><Check className="w-3 h-3" /> Sent</span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={rawMaterialDocsApi.downloadUrl(d.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => deleteMutation.mutate(d.id)}
                          title="Delete"
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && <UploadDocModal suppliers={suppliers} onClose={() => setShowUpload(false)} />}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupplierCompliance() {
  const [tab, setTab] = useState<'suppliers' | 'documents'>('suppliers')

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-teal-600 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Supplier Compliance</h1>
        </div>
        <p className="text-gray-400 text-sm ml-12">Manage suppliers, raw materials, and compliance documentation</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-8">
        <button
          onClick={() => setTab('suppliers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'suppliers'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Suppliers
        </button>
        <button
          onClick={() => setTab('documents')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'documents'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Raw Material Docs
        </button>
      </div>

      {tab === 'suppliers' ? <SuppliersTab /> : <RawMaterialDocsTab />}
    </div>
  )
}
