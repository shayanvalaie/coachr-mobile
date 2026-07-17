import { BackendClient } from "./types";
import { fastApiBackendClient } from "./fastApiProvider";

export const backendClient: BackendClient = fastApiBackendClient;
