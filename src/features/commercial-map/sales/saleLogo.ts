import { supabase } from '@/integrations/supabase/client';

const MAX_INPUT = 12 * 1024 * 1024;

/** A contained WebP thumbnail with a neutral, clean background. Never guesses a company logo from a portrait. */
export async function prepareSaleLogo(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_INPUT) throw new Error('Escolha uma imagem PNG, JPG ou WebP de até 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const side = 512;
    const canvas = document.createElement('canvas');
    canvas.width = side; canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível tratar a imagem neste dispositivo.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, side, side);
    const ratio = Math.min(448 / bitmap.width, 448 / bitmap.height);
    const width = bitmap.width * ratio, height = bitmap.height * ratio;
    ctx.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
    if (!blob || blob.size > 1024 * 1024) throw new Error('Imagem grande demais após o tratamento.');
    return blob;
  } finally { bitmap.close(); }
}

export async function uploadSaleLogo(orderId: string, key: string, image: Blob) {
  const { data: order, error: orderError } = await supabase.from('lot_sale_orders').select('project_id').eq('id', orderId).single();
  if (orderError || !order) throw new Error('Venda registrada, mas não foi possível associar a imagem.');
  const { data: project, error: projectError } = await supabase.from('map_projects').select('org_id').eq('id', order.project_id).single();
  if (projectError || !project) throw new Error('Venda registrada, mas o projeto da imagem não foi localizado.');
  const path = `${project.org_id}/${key}.webp`;
  const { error: uploadError } = await supabase.storage.from('commercial-sale-logos').upload(path, image, { contentType: 'image/webp', upsert: false });
  if (uploadError && !uploadError.message.toLowerCase().includes('already exists')) throw new Error('Venda registrada, mas o envio da imagem falhou.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('attach_commercial_sale_logo', { p_order_id: orderId, p_path: path });
  if (error) throw new Error('Venda registrada, mas a imagem não foi associada.');
}

export async function fetchSaleLogoUrls(input: { projectId: string } | { slug: string; token: string }): Promise<Record<string, string>> {
  const { data, error } = await supabase.functions.invoke('commercial-sale-logo-urls', { body: input });
  if (error) return {};
  return data?.logos ?? {};
}
