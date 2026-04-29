import { useState } from 'react';
import { useNotificationRecipients, NotificationRecipient } from '@/hooks/useNotificationRecipients';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Bell, Plane, Plus, Trash2, Pencil } from 'lucide-react';

const DEFAULT_TEMPLATE = 'Olá {nome_destinatario}, {motorista} aqui, estou iniciando meu deslocamento para o {destino} para buscar {hospede}, tudo certo com o voo {voo}? Se alguma alteração, me comunique! Obrigado!';

export default function NotificationRecipientsSection() {
  const { myRole } = useCurrentOrg();
  const { recipients, isLoading, create, update, remove } = useNotificationRecipients();
  const canManage = myRole === 'admin' || myRole === 'gestor';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRecipient | null>(null);
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    tipo: 'agente_viagem',
    ativo: true,
    notify_on_start: true,
    message_template: DEFAULT_TEMPLATE,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', telefone: '', tipo: 'agente_viagem', ativo: true, notify_on_start: true, message_template: DEFAULT_TEMPLATE });
    setOpen(true);
  };

  const openEdit = (r: NotificationRecipient) => {
    setEditing(r);
    setForm({
      nome: r.nome,
      telefone: r.telefone,
      tipo: r.tipo,
      ativo: r.ativo,
      notify_on_start: r.notify_on_start,
      message_template: r.message_template,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.nome.trim() || !form.telefone.trim() || !form.message_template.trim()) return;
    if (editing) {
      await update.mutateAsync({ id: editing.id, patch: form });
    } else {
      await create.mutateAsync(form);
    }
    setOpen(false);
  };

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" /> Notificações Automáticas
        </h2>
        {canManage && (
          <Button size="sm" onClick={openNew} className="h-9 rounded-xl gap-1.5">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Pessoas que recebem WhatsApp automaticamente toda vez que um transporte é iniciado.
        Variáveis disponíveis: <code className="text-[10px]">{'{nome_destinatario}'}</code>, <code className="text-[10px]">{'{motorista}'}</code>, <code className="text-[10px]">{'{destino}'}</code>, <code className="text-[10px]">{'{hospede}'}</code>, <code className="text-[10px]">{'{voo}'}</code>.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum destinatário cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                  <Plane className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{r.nome}</p>
                    {!r.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{r.telefone} • {r.tipo === 'agente_viagem' ? 'Agente de Viagem' : r.tipo}</p>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} className="h-8 w-8">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover {r.nome}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A pessoa não receberá mais mensagens automáticas ao iniciar transportes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(r.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar destinatário' : 'Novo destinatário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value.toUpperCase() })} className="uppercase" />
            </div>
            <div>
              <Label className="text-xs">Telefone (com DDI)</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="+5555999628546" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="agente_viagem" />
            </div>
            <div>
              <Label className="text-xs">Modelo da mensagem</Label>
              <Textarea
                value={form.message_template}
                onChange={(e) => setForm({ ...form, message_template: e.target.value })}
                rows={6}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use {'{nome_destinatario}'}, {'{motorista}'}, {'{destino}'}, {'{hospede}'}, {'{voo}'}.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <Label className="text-sm">Ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <Label className="text-sm">Notificar ao iniciar transporte</Label>
              <Switch checked={form.notify_on_start} onCheckedChange={(v) => setForm({ ...form, notify_on_start: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
