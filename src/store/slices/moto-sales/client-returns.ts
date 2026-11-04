import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import type { ClientReturnStockFate, PreviewChangeItemSku } from '@/features/orders/client-returns/clientReturnPreview';
import {
  uploadClientOrderReturnProof,
  uploadClientOrderReturnSignature,
} from '@/features/orders/client-returns/uploadClientOrderReturnEvidence';
import { motoSalesRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type CreateClientReturnResult = {
  id: string;
  returnNumber: string;
  status: string;
};

type MotoClientReturnsState = {
  postedQtyByOrderId: Record<string, Record<string, number>>;
  postedQtyStatus: QueryStatus;
  postedQtyError: string | null;
  changeCatalog: PreviewChangeItemSku[];
  changeCatalogKey: string | null;
  changeCatalogStatus: QueryStatus;
  changeCatalogError: string | null;
  createStatus: QueryStatus;
  createError: string | null;
  lastCreated: CreateClientReturnResult | null;
};

const initialState: MotoClientReturnsState = {
  postedQtyByOrderId: {},
  postedQtyStatus: 'idle',
  postedQtyError: null,
  changeCatalog: [],
  changeCatalogKey: null,
  changeCatalogStatus: 'idle',
  changeCatalogError: null,
  createStatus: 'idle',
  createError: null,
  lastCreated: null,
};

async function uploadReturnPhotoAttachments(
  photos: PackageProofPhotoItem[],
  companyId: string
) {
  const attachments = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const photoKind = photo.fileName.toLowerCase().startsWith('capture') ? 'capture' : 'proof';
    let file = photo.file;
    if (!file && photo.previewUrl.startsWith('blob:')) {
      const response = await fetch(photo.previewUrl);
      const blob = await response.blob();
      file = new File([blob], photo.fileName || `proof-${index + 1}.jpg`, {
        type: blob.type || 'image/jpeg',
      });
    }
    const uploaded = await uploadClientOrderReturnProof({
      file,
      dataUrl: file ? undefined : photo.previewUrl,
      companyId,
      fileName: photo.fileName,
      kind: photoKind,
    });
    attachments.push({
      file_url: uploaded.url,
      file_path: uploaded.path,
      file_name: photo.fileName,
      content_type: uploaded.contentType,
      source: photoKind === 'capture' ? 'capture' : 'upload',
      sort_order: index,
    });
  }
  return attachments;
}

export const fetchPostedReturnedQty = createAsyncThunk(
  'motoClientReturns/fetchPostedQty',
  async (orderId: string) => {
    const body = await motoSalesRequest<{ qtyByItemId: Record<string, number> }>('client-returns', {
      params: { resource: 'posted-qty', orderId },
    });
    return { orderId, qtyByItemId: body.qtyByItemId || {} };
  }
);

export const fetchChangeItemCatalog = createAsyncThunk(
  'motoClientReturns/fetchChangeCatalog',
  async (brandIds: string[]) => {
    const ids = [...new Set(brandIds.filter(Boolean))];
    const body = await motoSalesRequest<{ skus: PreviewChangeItemSku[] }>('client-returns', {
      params: {
        resource: 'change-catalog',
        brandIds: ids.join(','),
      },
    });
    return {
      key: ids.slice().sort().join('|'),
      skus: body.skus || [],
    };
  }
);

export const createClientOrderReturn = createAsyncThunk(
  'motoClientReturns/create',
  async (input: {
    companyId: string;
    clientOrderId: string;
    returnDate: string;
    reason: string;
    notes: string;
    signatureDataUrl: string;
    items: Array<{ clientOrderItemId: string; quantity: number; stockFate: ClientReturnStockFate }>;
    changeItems: Array<{ variantId: string; quantity: number }>;
    photos: PackageProofPhotoItem[];
    returnType?: 'change_item' | 'refund';
  }) => {
    const signature = await uploadClientOrderReturnSignature({
      signatureDataUrl: input.signatureDataUrl,
      companyId: input.companyId,
    });
    const attachments = await uploadReturnPhotoAttachments(input.photos, input.companyId);

    return motoSalesRequest<CreateClientReturnResult>('client-returns', {
      method: 'POST',
      body: {
        action: 'create',
        client_order_id: input.clientOrderId,
        return_date: input.returnDate,
        reason: input.reason,
        notes: input.notes,
        agent_signature_url: signature.url,
        items: input.items.map((item) => ({
          client_order_item_id: item.clientOrderItemId,
          quantity: item.quantity,
          stock_fate: item.stockFate,
        })),
        change_items: input.changeItems.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        attachments,
        return_type: input.returnType === 'refund' ? 'refund' : 'change_item',
      },
    });
  }
);

const motoClientReturnsSlice = createSlice({
  name: 'motoClientReturns',
  initialState,
  reducers: {
    resetMotoClientReturns(state) {
      Object.assign(state, initialState);
    },
    clearChangeCatalog(state) {
      state.changeCatalog = [];
      state.changeCatalogKey = null;
      state.changeCatalogStatus = 'idle';
      state.changeCatalogError = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchPostedReturnedQty.pending, (state) => {
        state.postedQtyError = null;
        if (state.postedQtyStatus !== 'succeeded') state.postedQtyStatus = 'loading';
      })
      .addCase(fetchPostedReturnedQty.fulfilled, (state, action) => {
        state.postedQtyStatus = 'succeeded';
        state.postedQtyByOrderId[action.payload.orderId] = action.payload.qtyByItemId;
      })
      .addCase(fetchPostedReturnedQty.rejected, (state, action) => {
        state.postedQtyStatus = 'failed';
        state.postedQtyError = action.error.message || 'Failed to load posted return qty';
      })
      .addCase(fetchChangeItemCatalog.pending, (state) => {
        state.changeCatalogError = null;
        if (state.changeCatalogStatus !== 'succeeded') state.changeCatalogStatus = 'loading';
      })
      .addCase(fetchChangeItemCatalog.fulfilled, (state, action) => {
        state.changeCatalogStatus = 'succeeded';
        state.changeCatalogKey = action.payload.key;
        state.changeCatalog = action.payload.skus;
      })
      .addCase(fetchChangeItemCatalog.rejected, (state, action) => {
        state.changeCatalogStatus = 'failed';
        state.changeCatalogError = action.error.message || 'Failed to load change catalog';
        state.changeCatalog = [];
      })
      .addCase(createClientOrderReturn.pending, (state) => {
        state.createError = null;
        state.createStatus = 'loading';
        state.lastCreated = null;
      })
      .addCase(createClientOrderReturn.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.lastCreated = action.payload;
      })
      .addCase(createClientOrderReturn.rejected, (state, action) => {
        state.createStatus = 'failed';
        state.createError = action.error.message || 'Failed to create client return';
      });
  },
});

export const { resetMotoClientReturns, clearChangeCatalog } = motoClientReturnsSlice.actions;
export const motoClientReturnsReducer = motoClientReturnsSlice.reducer;
