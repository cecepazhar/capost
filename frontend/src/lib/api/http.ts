import {
  cmdHttpExecuteRequest,
  type HttpRequestPayload,
  type HttpResponsePayload
} from '$lib/generated/commands';

export type { HttpRequestPayload, HttpResponsePayload };

export async function executeHttpRequest(
  payload: HttpRequestPayload
): Promise<HttpResponsePayload> {
  return await cmdHttpExecuteRequest({ payload });
}
