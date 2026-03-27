import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Download, Eye, CalendarIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { useTransports } from '@/hooks/useTransports';
import { useVehicles } from '@/hooks/useVehicles';
import { useGuests } from '@/hooks/useGuests';
import { useEvents } from '@/hooks/useEvents';
import { useTasks } from '@/hooks/useTasks';
import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useScooters } from '@/hooks/useScooters';
import { useSchedules } from '@/hooks/useSchedules';
import { useFuelRecords } from '@/hooks/useFuelRecords';
import { useVehicleUsage } from '@/hooks/useVehicleUsage';
import { useOrgMembers } from '@/hooks/useOrgMembers';

import { ALL_MODULES, collectSystemReport, type SystemReportPayload } from '@/lib/systemReportCollector';
import { generateSystemReportPdf } from '@/lib/generateSystemReportPdf';

export default function SystemReportPage() {
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(2026, 3, 28));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date(2026, 4, 10));
  const [selectedModules, setSelectedModules] = useState<string[]>(ALL_MODULES.map(m => m.id));
  const [preview, setPreview] = useState<SystemReportPayload | null>(null);
  const [generating, setGenerating] = useState(false);

  // Hooks
  const { transports } = useTransports();
  const { vehicles } = useVehicles();
  const { guests } = useGuests();
  const { events } = useEvents();
  const { tasks } = useTasks();
  const { carts } = useElectricCarts();
  const { scooters } = useScooters();
  const { schedules, shifts, assignments } = useSchedules();
  const { records: fuelRecords } = useFuelRecords();
  const { usages } = useVehicleUsage();
  const { members } = useOrgMembers();

  const dataByModule = useMemo(() => ({
    transports,
    vehicles,
    vehicle_usage: usages,
    fuel_records: fuelRecords,
    guests,
    events,
    tasks,
    electric_carts: carts,
    scooters,
    schedules,
    schedule_shifts: shifts,
    shift_assignments: assignments,
    org_members: members,
  }), [transports, vehicles, usages, fuelRecords, guests, events, tasks, carts, scooters, schedules, shifts, assignments, members]);

  const toggleModule = (id: string) => {
    setSelectedModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
    setPreview(null);
  };

  const selectAll = () => {
    setSelectedModules(ALL_MODULES.map(m => m.id));
    setPreview(null);
  };

  const handlePreview = () => {
    if (!startDate || !endDate) {
      toast.error('Selecione o período completo');
      return;
    }
    if (selectedModules.length === 0) {
      toast.error('Selecione ao menos um módulo');
      return;
    }
    const payload = collectSystemReport(
      dataByModule,
      {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
      },
      selectedModules,
    );
    setPreview(payload);
  };

  const handleGenerate = () => {
    if (!preview) {
      handlePreview();
      return;
    }
    setGenerating(true);
    try {
      generateSystemReportPdf(preview);
      toast.success('PDF gerado com sucesso!');
    } catch (err) {
      toast.error('Erro ao gerar PDF');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Relatório do Sistema
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gere um PDF completo com todos os dados registrados no sistema em um período selecionado.
          Serve como base de continuidade operacional e contingência em caso de falha.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Dados consolidados de: Transportes, Veículos, Hóspedes, Agenda, Tarefas, Carrinhos, Patinetes, Escalas e Equipe.
          Apenas dados com base persistida entram no relatório.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros do Relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Date pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setPreview(null); }} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setPreview(null); }} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Module selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Módulos Incluídos</Label>
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                Selecionar Todos
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ALL_MODULES.map(mod => (
                <label
                  key={mod.id}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm',
                    selectedModules.includes(mod.id)
                      ? 'border-primary/30 bg-primary/5 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <Checkbox
                    checked={selectedModules.includes(mod.id)}
                    onCheckedChange={() => toggleModule(mod.id)}
                  />
                  <span className="truncate">{mod.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="outline" onClick={handlePreview} className="gap-2">
              <Eye className="w-4 h-4" /> Visualizar Prévia
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              <Download className="w-4 h-4" /> {generating ? 'Gerando...' : 'Gerar PDF'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Prévia do Relatório
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-foreground">{preview.totalRecords}</p>
                  <p className="text-xs text-muted-foreground">Registros</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-foreground">{preview.modules.length}</p>
                  <p className="text-xs text-muted-foreground">Módulos</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-foreground">
                    {format(new Date(preview.period.start), 'dd/MM')} - {format(new Date(preview.period.end + 'T12:00:00'), 'dd/MM')}
                  </p>
                  <p className="text-xs text-muted-foreground">Período</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className={cn('text-2xl font-bold', preview.totalInconsistencies > 0 ? 'text-amber-500' : 'text-green-500')}>
                    {preview.totalInconsistencies}
                  </p>
                  <p className="text-xs text-muted-foreground">Inconsistências</p>
                </div>
              </div>

              {/* Per-module breakdown */}
              <div className="space-y-2">
                {preview.modules.map(mod => (
                  <div key={mod.config.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card border">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{mod.config.label}</span>
                      {mod.inconsistencies.length > 0 && (
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px] px-1.5">
                          <AlertTriangle className="w-3 h-3 mr-0.5" />
                          {mod.inconsistencies.length}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{mod.total} registros</span>
                      <span className="text-green-600">+{mod.created}</span>
                      <span className="text-blue-600">~{mod.updated}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Inconsistency details */}
              {preview.totalInconsistencies > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm font-medium text-amber-600 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-4 h-4" /> Inconsistências Detectadas
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                    {preview.modules.flatMap(m =>
                      m.inconsistencies.map((inc, i) => (
                        <li key={`${m.config.id}-${i}`}>• {inc}</li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
