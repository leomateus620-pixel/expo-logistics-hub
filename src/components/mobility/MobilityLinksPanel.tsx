import { useState } from 'react';
import { usePublicFormLinks } from '@/hooks/usePublicFormLinks';
import { useOfficialCommittees } from '@/hooks/useOfficialCommittees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, Copy, Check, Loader2, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function MobilityLinksPanel() {
  const { data: links, isLoading, generateAll, toggleActive } = usePublicFormLinks();
  const { committees } = useOfficialCommittees();
  const [generatedTokens, setGeneratedTokens] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  const handleGenerate = async () => {
    if (!committees?.length) return;
    const result = await generateAll.mutateAsync(committees);
    if (result) {
      const map: Record<string, string> = {};
      result.forEach((r) => { map[r.committee_id] = r.token; });
      setGeneratedTokens((prev) => ({ ...prev, ...map }));
    }
  };

  const copyLink = async (token: string, id: string) => {
    const url = `${baseUrl}/f/mobilidade/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalLinks = links?.length ?? 0;
  const activeLinks = links?.filter((l) => l.is_active).length ?? 0;

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
                {totalLinks} links gerados · {activeLinks} ativos
              </CardDescription>
            </div>
            <Button onClick={handleGenerate} disabled={generateAll.isPending || !committees?.length} size="sm">
              {generateAll.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <LinkIcon className="w-4 h-4 mr-1" />}
              Gerar links para todas
            </Button>
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
                    const token = generatedTokens[link.committee_id];
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
                            <span className="text-xs text-muted-foreground">Gerado anteriormente</span>
                          )}
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
