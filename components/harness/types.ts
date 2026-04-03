export type HarnessUnit = {
  id: string;
  serialNumber: string | null;
  barcode: string | null;
  orderId: string;
  productId: string;
  assignedUserId: string | null;
  status: string;
  harnessModel: string | null;
  qcData: Record<string, { status: string; remarks?: string; name?: string }> | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  order: { id: string; orderNumber: string; clientId: string; quantity: number };
  product: { id: string; code: string; name: string };
  assignedUser: { id: string; name: string } | null;
  pairedController: { id: string; serialNumber: string } | null;
};

export type Connector = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

/** null = not yet tested (operator must explicitly choose) */
export type QCResultStatus = 'PASS' | 'FAIL' | null;

export type QCResult = {
  status: QCResultStatus;
  remarks: string;
};
