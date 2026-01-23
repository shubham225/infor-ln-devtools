import axios, { AxiosRequestConfig } from "axios";

export interface SoapRequestOptions {
  serverUrl: string;
  method: string;
  interfaceId?: string;
  requestBody: Record<string, any>;
  signal?: AbortSignal;
}

/**
 * Makes a SOAP request to the ERP BDE API service
 * Wraps JSON request in SOAP envelope and extracts JSON response from RawResponse tag
 */
export async function makeSoapRequest(
  options: SoapRequestOptions,
): Promise<Record<string, any>> {
  const {
    serverUrl,
    method,
    interfaceId = "DEV",
    requestBody,
    signal,
  } = options;

  // Build SOAP envelope
  const soapBody = buildSoapEnvelope(method, interfaceId, requestBody);

  // SOAP endpoint path
  const soapEndpoint = "";
  const fullUrl = `${serverUrl}${soapEndpoint}`;

  const axiosConfig: AxiosRequestConfig = {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    signal,
  };

  try {
    const response = await axios.post(fullUrl, soapBody, axiosConfig);

    // Extract and parse JSON from RawResponse tag
    const jsonData = extractJsonFromSoapResponse(response.data);

    if (jsonData?.error || jsonData?.errorMessage) {
      throw new Error(jsonData.error || jsonData.errorMessage);
    }

    // Remove vrc tag if present
    const { vrc, ...cleanJson } = jsonData;

    return cleanJson;
  } catch (error: any) {
    // Re-throw with better error message
    if (error?.name === "CanceledError" || error?.name === "AbortError") {
      throw error;
    }

    if (!error.response) {
      const msg = error.message || "Unknown network failure";
      throw new Error(`${msg}`);
    }
    // ----- HTTP errors (request reached server but failed) -----
    const { status, statusText, data } = error.response;

    // SOAP may return fault inside XML even on HTTP 500
    const faultMatch =
      typeof data === "string"
        ? data.match(/<faultstring>([\s\S]*?)<\/faultstring>/i)
        : null;

    if (faultMatch && faultMatch[1].trim() !== "") {
      throw new Error(`SOAP Fault: ${faultMatch[1].trim()}`);
    }

    // Generic HTTP error format
    throw new Error(`HTTP Error: ${status} ${statusText}`);
  }
}

/**
 * Builds a SOAP envelope with the given method, interface ID, and request body
 */
function buildSoapEnvelope(
  method: string,
  interfaceId: string,
  requestBody: Record<string, any>,
): string {
  const rawRequest = JSON.stringify(requestBody);

  return `<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/">
  <Header/>
  <Body>
    <getRequestXML xmlns="http://www.infor.com/businessinterface/BDENamespace">
      <getRequestXMLRequest>
        <DataArea>
          <BDENamespace>
            <InterfaceID>${escapeXml(interfaceId)}</InterfaceID>
            <Method>${escapeXml(method)}</Method>
            <Request>
              <IntegrationMethod>JSONCDATA</IntegrationMethod>
              <RawRequest>${escapeXml(rawRequest)}</RawRequest>
            </Request>
          </BDENamespace>
        </DataArea>
      </getRequestXMLRequest>
    </getRequestXML>
  </Body>
</Envelope>`;
}

/**
 * Extracts JSON from RawResponse tag in SOAP response
 */
function extractJsonFromSoapResponse(
  soapResponse: string,
): Record<string, any> {
  // Find RawResponse tag content
  const rawResponseMatch = soapResponse.match(
    /<RawResponse>([\s\S]*?)<\/RawResponse>/,
  );

  if (!rawResponseMatch || !rawResponseMatch[1]) {
    throw new Error("No RawResponse found in SOAP response");
  }

  const rawResponseContent = rawResponseMatch[1].trim();

  try {
    const jsonData = JSON.parse(rawResponseContent);
    return jsonData;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from RawResponse: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Escapes XML special characters
 */
function escapeXml(str: string): string {
  const xmlMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };

  return str.replace(/[&<>"']/g, (char) => xmlMap[char] || char);
}
