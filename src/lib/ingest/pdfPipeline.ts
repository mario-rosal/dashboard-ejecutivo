
import { supabase } from '@/lib/supabaseClient';

export async function uploadPdfToWebhook(file: File): Promise<void> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
        throw new Error("No hay sesión (access_token)");
    }

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('filename', file.name);

    const response = await fetch('/api/pdf/ingest', {
        method: 'POST',
        body: formData,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook Error: ${response.status} ${text}`);
    }
}
