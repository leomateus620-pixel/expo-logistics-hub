import { useState } from 'react';
import { usePublicFormLinks } from '@/hooks/usePublicFormLinks';
import { useOfficialCommittees } from '@/hooks/useOfficialCommittees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, Copy, Check, Loader2, LinkIcon, RefreshCw, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';

export default function MobilityLinksPanel() {
  const { data: links, isLoading, generateAll, regenerateToken, regenerateAllTokens, toggleActive } = usePublicFormLinks();
  const { committees } = useOfficialCommittees();
  // Map linkId -> raw token (available after generate or regenerate)
  const [availableTokens, setAvailableTokens] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyingAll, setCopyingAll] = useState(false);

  const publishedUrl = 'https://fenasojalog.lovable.app';

  const handleGenerate = async () => {
    if (!committees?.length) return;
    const result = await generateAll.mutateAsync(committees);
    if (result) {
      const map: Record<string, string> = {};
      // We need to map committee_id -> link id after refresh, but for now map by committee
      result.forEach((r) => { map[`committee_${r.committee_id}`] = r.token; });
      setAvailableTokens((prev) => ({ ...prev, ...map }));
    }
  };

  const handleRegenerate = async (linkId: string) => {
    const result = await regenerateToken.mutateAsync(linkId);
    setAvailableTokens((prev) => ({ ...prev, [linkId]: result.token }));
    toast.success('Novo token gerado! Copie o link agora.');
  };

  const copyLink = async (token: string, id: string) => {
    const url = `https://fenasojalog.lovable.app/f/mobilidade/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = async () => {
    if (!links?.length) return;
    const activeLinks = links.filter((l) => l.is_active);
    if (!activeLinks.length) {
      toast.error('Nenhum link ativo para copiar');
      return;
    }
    setCopyingAll(true);
    try {
      const results = await regenerateAllTokens.mutateAsync(activeLinks.map((l) => l.id));
      const tokenMap: Record<string, string> = {};
      results.forEach((r) => { tokenMap[r.linkId] = r.token; });
      setAvailableTokens((prev) => ({ ...prev, ...tokenMap }));

      const lines = results
        .map((r) => {
          const link = activeLinks.find((l) => l.id === r.linkId);
          if (!link) return null;
          return `📌 ${link.committee_name_snapshot.toUpperCase()}\nPresidente: ${link.president_name_snapshot}\nLink: https://fenasojalog.lovable.app/f/mobilidade/${r.token}`;
        })
        .filter(Boolean);

      const text = `📋 Links de Mobilidade — Fenasoja 2026\n\n${lines.join('\n\n')}\n\n---\nTotal: ${lines.length} comissões`;
      await navigator.clipboard.writeText(text);
      toast.success(`${lines.length} links copiados para a área de transferência!`);
    } catch {
      toast.error('Erro ao gerar links');
    } finally {
      setCopyingAll(false);
    }
  };

  const totalLinks = links?.length ?? 0;
  const activeCount = links?.filter((l) => l.is_active).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                Links de Acesso Público
              </CardTitle>
              <CardDescription>
                {totalLinks} links gerados · {activeCount} ativos
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!!links?.length && (
                <Button onClick={handleCopyAll} disabled={copyingAll || regenerateAllTokens.isPending} size="sm" variant="outline">
                  {copyingAll ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ClipboardList className="w-4 h-4 mr-1" />}
                  Copiar Todos
                </Button>
              )}
              <Button onClick={handleGenerate} disabled={generateAll.isPending || !committees?.length} size="sm">
                {generateAll.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <LinkIcon className="w-4 h-4 mr-1" />}
                Gerar links para todas
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !links?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <LinkIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Nenhum link gerado ainda.</p>
              <p className="text-xs mt-1">Clique em "Gerar links para todas" para criar os links de acesso.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Presidente</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-center">Ativo</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => {
                    // Token available from generation (by committee) or regeneration (by link id)
                    const token = availableTokens[link.id] || availableTokens[`committee_${link.committee_id}`];
                    return (
                      <TableRow key={link.id}>
                        <TableCell className="font-medium text-sm">{link.committee_name_snapshot}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{link.president_name_snapshot}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            ...{link.token_hint}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={link.is_active}
                            onCheckedChange={(checked) => toggleActive.mutate({ id: link.id, is_active: checked })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {token ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyLink(token, link.id)}
                                className="gap-1"
                              >
                                {copiedId === link.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedId === link.id ? 'Copiado' : 'Copiar'}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRegenerate(link.id)}
                                disabled={regenerateToken.isPending}
                                className="gap-1 text-xs"
                              >
                                {regenerateToken.isPending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                                Gerar novo link
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
