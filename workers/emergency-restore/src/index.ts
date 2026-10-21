// Phase 0: refuses everything. The emergency window, step-up check and in-memory decrypt land in Phase 4.
export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler;
