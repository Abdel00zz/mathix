
export interface ProgressReportPayload {
    studentName: string;
    chapterTitle: string;
    progressData: any;
}

export const apiService = {
    /**
     * Envoie le rapport de progression à l'API Serverless Vercel
     */
    async sendProgressReport(payload: ProgressReportPayload): Promise<boolean> {
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API Error:', errorData);
                throw new Error(errorData.error || 'Erreur lors de l\'envoi');
            }

            return true;
        } catch (error) {
            console.error('Failed to send progress report:', error);
            return false;
        }
    }
};
