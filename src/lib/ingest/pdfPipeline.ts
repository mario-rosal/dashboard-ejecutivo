
export async function uploadPdfToWebhook(file: File): Promise<void> {
    // TODO: Replace with actual n8n webhook URL
    const WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

    if (!WEBHOOK_URL) {
        console.warn('n8n Webhook URL not configured');
        // Simulate success for demo purposes
        return new Promise(resolve => setTimeout(resolve, 1500));
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Webhook Error: ${response.statusText}`);
        }
    } catch (error) {
        console.error('PDF Upload Failed', error);
        throw error;
    }
}
