import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import {
  BookOpen,
  Gamepad2,
  Plus,
  ScanLine,
  Trash2,
  Pencil,
  Check,
  Loader2,
  AlarmClock,
  Clock,
  CalendarDays,
  History,
  Camera,
  CameraOff,
  Search,
  Keyboard,
} from 'lucide-react';
import { formatDate } from '../lib/formatters';

const STATUS_STYLES = {
  borrowed: 'bg-secondary text-muted-foreground border-transparent',
  due_soon: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  overdue: 'bg-red-500/10 text-red-600 border-red-500/30',
  returned: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
};

const TYPE_ICONS = { book: BookOpen, videogame: Gamepad2 };
const BARCODE_FORMATS_HINT = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

function toDateInputValue(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function todayInputValue() {
  return toDateInputValue(new Date());
}

function addDays(dateInputValue, days) {
  const d = new Date(`${dateInputValue}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

const EMPTY_FORM = {
  type: 'book',
  title: '',
  author: '',
  publisher: '',
  cover_url: '',
  barcode: '',
  notes: '',
  borrowed_at: todayInputValue(),
  due_at: '',
};

export default function LoansPage() {
  const { t, i18n } = useTranslation(['loans', 'common']);
  const { api, activeHousehold } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lookupSource, setLookupSource] = useState(null);
  const [lookupNotFound, setLookupNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanType, setScanType] = useState(null); // null | 'book' | 'videogame'
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searching, setSearching] = useState(false);

  const videoRef = useRef(null);
  const codeReader = useRef(null);
  const handledRef = useRef(false);

  const bookDurationDays = activeHousehold?.loan_book_duration_days || 21;
  const gameDurationDays = activeHousehold?.loan_game_duration_days || 14;

  const fetchLoans = useCallback(async () => {
    try {
      const response = await api.get('/loans');
      setLoans(response.data);
    } catch (error) {
      toast.error(t('toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS_HINT);
    codeReader.current = new BrowserMultiFormatReader(hints);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    if (codeReader.current) {
      codeReader.current.reset();
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    handledRef.current = false;
    try {
      setCameraActive(true);
      await codeReader.current.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result && !handledRef.current) {
          handledRef.current = true;
          handleBarcodeDetected(result.getText());
        }
      });
    } catch (error) {
      setCameraError(t('scan.camera.accessError'));
      setCameraActive(false);
    }
  };

  const openScanDialog = (type) => {
    setScanType(type);
    setManualBarcode('');
    setCameraError(null);
    setScanDialogOpen(true);
  };

  const closeScanDialog = () => {
    stopCamera();
    setScanDialogOpen(false);
    setScanType(null);
  };

  const handleLookup = async (rawBarcode) => {
    const barcode = rawBarcode.trim();
    if (!barcode) return;
    setSearching(true);
    try {
      const endpoint = scanType === 'book' ? `/loans/lookup/book/${barcode}` : `/loans/lookup/videogame/${barcode}`;
      const response = await api.get(endpoint);
      openResultDialog(scanType, barcode, response.data);
    } catch (error) {
      if (scanType === 'book') toast.warning(t('toast.lookupBookNotFound'));
      else toast.warning(t('toast.lookupGameNotFound'));
      openResultDialog(scanType, barcode, null);
    } finally {
      setSearching(false);
      closeScanDialog();
    }
  };

  const handleBarcodeDetected = (barcode) => {
    handleLookup(barcode);
  };

  const handleManualSearch = () => handleLookup(manualBarcode);

  const openResultDialog = (type, barcode, lookupData) => {
    const borrowedAt = todayInputValue();
    const durationDays = type === 'book' ? bookDurationDays : gameDurationDays;
    setEditingId(null);
    setForm({
      type,
      title: lookupData?.title || '',
      author: lookupData?.author || '',
      publisher: lookupData?.publisher || '',
      cover_url: lookupData?.cover_url || '',
      barcode: barcode || '',
      notes: '',
      borrowed_at: borrowedAt,
      due_at: addDays(borrowedAt, durationDays),
    });
    setLookupSource(lookupData?.source || null);
    setLookupNotFound(!lookupData);
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    const borrowedAt = todayInputValue();
    setEditingId(null);
    setForm({ ...EMPTY_FORM, borrowed_at: borrowedAt, due_at: addDays(borrowedAt, bookDurationDays) });
    setLookupSource(null);
    setLookupNotFound(false);
    setDialogOpen(true);
  };

  const openEditDialog = (loan) => {
    setEditingId(loan.id);
    setForm({
      type: loan.type,
      title: loan.title,
      author: loan.author || '',
      publisher: loan.publisher || '',
      cover_url: loan.cover_url || '',
      barcode: loan.barcode || '',
      notes: loan.notes || '',
      borrowed_at: toDateInputValue(loan.borrowed_at),
      due_at: toDateInputValue(loan.due_at),
    });
    setLookupSource(loan.source);
    setLookupNotFound(false);
    setDialogOpen(true);
  };

  const handleTypeChange = (type) => {
    const durationDays = type === 'book' ? bookDurationDays : gameDurationDays;
    setForm((f) => ({ ...f, type, due_at: addDays(f.borrowed_at, durationDays) }));
  };

  const handleBorrowedAtChange = (value) => {
    const durationDays = form.type === 'book' ? bookDurationDays : gameDurationDays;
    setForm((f) => ({ ...f, borrowed_at: value, due_at: addDays(value, durationDays) }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error(t('toast.titleRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        title: form.title,
        author: form.author || null,
        publisher: form.publisher || null,
        cover_url: form.cover_url || null,
        barcode: form.barcode || null,
        notes: form.notes,
        borrowed_at: `${form.borrowed_at}T00:00:00`,
        due_at: `${form.due_at}T00:00:00`,
      };
      if (editingId) {
        await api.put(`/loans/${editingId}`, payload);
      } else {
        await api.post('/loans', payload);
      }
      setDialogOpen(false);
      await fetchLoans();
      toast.success(t(editingId ? 'saved' : 'created'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loanId) => {
    try {
      await api.delete(`/loans/${loanId}`);
      setLoans((prev) => prev.filter((l) => l.id !== loanId));
      toast.success(t('deleted'));
    } catch (error) {
      toast.error(t('toast.deleteError'));
    }
  };

  const handleReturn = async (loanId) => {
    try {
      const response = await api.post(`/loans/${loanId}/return`);
      setLoans((prev) => prev.map((l) => (l.id === loanId ? response.data : l)));
      toast.success(t('returned'));
    } catch (error) {
      toast.error(t('toast.returnError'));
    }
  };

  const currentLoans = useMemo(() => loans.filter((l) => l.status !== 'returned'), [loans]);
  const historyLoans = useMemo(
    () =>
      loans
        .filter((l) => l.status === 'returned')
        .sort((a, b) => new Date(b.returned_at) - new Date(a.returned_at)),
    [loans]
  );

  const overdueCount = currentLoans.filter((l) => l.status === 'overdue').length;
  const dueSoonCount = currentLoans.filter((l) => l.status === 'due_soon').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-12 w-12 text-primary" />
      </div>
    );
  }

  const renderLoanCard = (loan) => {
    const TypeIcon = TYPE_ICONS[loan.type];
    return (
      <div key={loan.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {loan.cover_url ? (
            <img src={loan.cover_url} alt={loan.title} className="w-12 h-16 rounded object-cover shrink-0" />
          ) : (
            <div className="w-12 h-16 rounded bg-secondary flex items-center justify-center shrink-0">
              <TypeIcon className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold truncate">{loan.title}</span>
              <Badge variant="outline" className={STATUS_STYLES[loan.status]}>
                {t(`status.${loan.status}`)}
              </Badge>
            </div>
            {loan.author && <p className="text-sm text-muted-foreground mt-0.5">{loan.author}</p>}
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              {loan.status === 'returned'
                ? t('list.returnedOn', { date: formatDate(loan.returned_at, { day: 'numeric', month: 'long', year: 'numeric' }) })
                : t('list.dueOn', { date: formatDate(loan.due_at, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {loan.status !== 'returned' && (
            <Button variant="outline" size="sm" onClick={() => handleReturn(loan.id)}>
              <Check className="w-4 h-4 mr-1" /> {t('markReturned')}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(loan)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(loan.id)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm italic">{t('page.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => openScanDialog('book')} title={`${t('scanButton')} (${t('type.book')})`}>
            <ScanLine className="w-4 h-4 mr-2 shrink-0" /> {t('type.book')}
          </Button>
          <Button variant="outline" onClick={() => openScanDialog('videogame')} title={`${t('scanButton')} (${t('type.videogame')})`}>
            <ScanLine className="w-4 h-4 mr-2 shrink-0" /> {t('type.videogame')}
          </Button>
          <Button onClick={openCreateDialog} className="btn-glow">
            <Plus className="w-4 h-4 mr-2 shrink-0" /> {t('addManual')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-red-500/10 shrink-0"><AlarmClock className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" /></div>
            <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold">{overdueCount}</p><p className="text-xs sm:text-sm text-muted-foreground truncate">{t('status.overdue')}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-yellow-500/10 shrink-0"><Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-700" /></div>
            <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold">{dueSoonCount}</p><p className="text-xs sm:text-sm text-muted-foreground truncate">{t('status.due_soon')}</p></div>
          </CardContent>
        </Card>
      </div>

      {currentLoans.length > 0 ? (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-lg font-semibold">{t('list.title')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {currentLoans.map(renderLoanCard)}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border border-dashed py-16 text-center">
          <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground">{t('empty')}</p>
        </Card>
      )}

      {historyLoans.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="w-5 h-5" /> {t('history.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {historyLoans.map(renderLoanCard)}
          </CardContent>
        </Card>
      )}

      {/* Dialog de scan */}
      <Dialog open={scanDialogOpen} onOpenChange={(open) => (open ? null : closeScanDialog())}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{t('scan.title')} — {scanType && t(`type.${scanType}`)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="scanner-container bg-black rounded-lg overflow-hidden relative">
              <div className={cameraActive ? 'relative' : 'hidden'}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-56 object-cover" />
              </div>
              {!cameraActive && (
                <div className="w-full h-56 flex flex-col items-center justify-center bg-secondary/20">
                  {cameraError ? (
                    <p className="text-sm text-muted-foreground text-center px-4">{cameraError}</p>
                  ) : (
                    <CameraOff className="w-10 h-10 text-muted-foreground mb-2" />
                  )}
                </div>
              )}
            </div>
            <Button className="w-full" variant={cameraActive ? 'destructive' : 'default'} onClick={cameraActive ? stopCamera : startCamera}>
              {cameraActive ? <><CameraOff className="w-4 h-4 mr-2" /> {t('scan.camera.stop')}</> : <><Camera className="w-4 h-4 mr-2" /> {t('scan.camera.start')}</>}
            </Button>

            <div className="pt-2 border-t border-border">
              <Label className="flex items-center gap-1.5 mb-2"><Keyboard className="w-4 h-4" /> {t('scan.manual.title')}</Label>
              <div className="flex gap-2">
                <Input
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  placeholder={t('scan.manual.inputPlaceholder')}
                  className="font-mono"
                />
                <Button onClick={handleManualSearch} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog ajout/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t(editingId ? 'dialog.editTitle' : 'dialog.addTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {lookupSource && (
              <div className="p-3 rounded-lg bg-emerald-500/10 flex items-center gap-3">
                {form.cover_url && <img src={form.cover_url} alt={form.title} className="w-12 h-16 rounded object-cover" />}
                <p className="text-sm text-emerald-600">{t('dialog.found', { source: lookupSource })}</p>
              </div>
            )}
            {lookupNotFound && (
              <div className="p-3 rounded-lg bg-amber-500/10">
                <p className="text-sm text-amber-600">{t('dialog.notFound')}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t('dialog.type')}</Label>
              <Select value={form.type} onValueChange={handleTypeChange} disabled={!!editingId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="book">{t('type.book')}</SelectItem>
                  <SelectItem value="videogame">{t('type.videogame')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('dialog.title')}</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('dialog.titlePlaceholder')} />
            </div>

            <div className="space-y-1.5">
              <Label>{form.type === 'book' ? t('dialog.authorBook') : t('dialog.authorVideogame')}</Label>
              <Input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('dialog.publisher')}</Label>
              <Input value={form.publisher} onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('dialog.borrowedAt')}</Label>
                <Input type="date" value={form.borrowed_at} onChange={(e) => handleBorrowedAtChange(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('dialog.dueAt')}</Label>
                <Input type="date" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('dialog.barcode')}</Label>
              <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} className="font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label>{t('dialog.notes')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={t('dialog.notesPlaceholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t(editingId ? 'common:actions.save' : 'add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
