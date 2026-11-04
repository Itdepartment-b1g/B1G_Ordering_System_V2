import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import type { ReturnedInventoryRow } from '@/features/orders/client-returns/clientReturnApi';
import type {
  ReturnLeaderHandover,
} from '@/features/orders/client-returns/returnLeaderApi';
import {
  uploadClientOrderReturnProof,
  uploadClientOrderReturnSignature,
} from '@/features/orders/client-returns/uploadClientOrderReturnEvidence';
import { motoSalesRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type CreateReturnLeaderResult = {
  id: string;
  returnNumber: string;
  status: string;
};

type MotoReturnLeaderState = {
  handovers: ReturnLeaderHandover[];
  handoversStatus: QueryStatus;
  handoversError: string | null;
  holdsByHolderId: Record<string, ReturnedInventoryRow[]>;
  holdsStatus: QueryStatus;
  holdsError: string | null;
  mutationStatus: QueryStatus;
  mutationError: string | null;
};

const initialState: MotoReturnLeaderState = {
  handovers: [],
  handoversStatus: 'idle',
  handoversError: null,
  holdsByHolderId: {},
  holdsStatus: 'idle',
  holdsError: null,
  mutationStatus: 'idle',
  mutationError: null,
};

async function uploadProofAttachments(photos: PackageProofPhotoItem[], companyId: string) {
  const attachments = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const kind = photo.fileName.toLowerCase().startsWith('capture') ? 'capture' : 'proof';
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
      kind,
    });
    attachments.push({
      file_url: uploaded.url,
      file_path: uploaded.path,
      file_name: photo.fileName,
      content_type: uploaded.contentType,
      source: kind === 'capture' ? 'capture' : 'upload',
      sort_order: index,
    });
  }
  return attachments;
}

export const fetchReturnLeaderHandovers = createAsyncThunk(
  'motoReturnLeader/fetchHandovers',
  async () => {
    const body = await motoSalesRequest<{ handovers: ReturnLeaderHandover[] }>('return-leader', {
      params: { resource: 'handovers' },
    });
    return body.handovers || [];
  }
);

export const fetchClientReturnStockHolds = createAsyncThunk(
  'motoReturnLeader/fetchHolds',
  async (holderId: string) => {
    const body = await motoSalesRequest<{ holds: ReturnedInventoryRow[] }>('return-leader', {
      params: { resource: 'holds', holderId },
    });
    return { holderId, holds: body.holds || [] };
  }
);

export const createReturnLeaderHandover = createAsyncThunk(
  'motoReturnLeader/create',
  async (input: {
    companyId: string;
    items: Array<{ variantId: string; brandId?: string; variantTypeId?: string; quantity: number }>;
    notes?: string;
    photos: PackageProofPhotoItem[];
    signatureDataUrl: string;
  }) => {
    if (!input.photos.length) throw new Error('Add at least one photo before submitting');
    if (!input.signatureDataUrl.trim()) throw new Error('Add your signature before submitting');

    const [attachments, signature] = await Promise.all([
      uploadProofAttachments(input.photos, input.companyId),
      uploadClientOrderReturnSignature({
        signatureDataUrl: input.signatureDataUrl,
        companyId: input.companyId,
      }),
    ]);

    return motoSalesRequest<CreateReturnLeaderResult>('return-leader', {
      method: 'POST',
      body: {
        action: 'create',
        items: input.items.map((item) => ({
          variant_id: item.variantId,
          brand_id: item.brandId || null,
          variant_type_id: item.variantTypeId || null,
          quantity: item.quantity,
        })),
        notes: input.notes?.trim() || null,
        attachments,
        agent_signature_url: signature.url,
        agent_signature_path: signature.path,
      },
    });
  }
);

export const approveReturnLeaderHandover = createAsyncThunk(
  'motoReturnLeader/approve',
  async (input: { handoverId: string; photos: PackageProofPhotoItem[]; companyId: string }) => {
    const attachments = await uploadProofAttachments(input.photos, input.companyId);
    await motoSalesRequest<{ success: boolean }>('return-leader', {
      method: 'POST',
      body: {
        action: 'approve',
        handover_id: input.handoverId,
        attachments,
      },
    });
    return input.handoverId;
  }
);

export const rejectReturnLeaderHandover = createAsyncThunk(
  'motoReturnLeader/reject',
  async (input: { handoverId: string; note?: string }) => {
    await motoSalesRequest<{ success: boolean }>('return-leader', {
      method: 'POST',
      body: {
        action: 'reject',
        handover_id: input.handoverId,
        note: input.note ?? null,
      },
    });
    return input.handoverId;
  }
);

const motoReturnLeaderSlice = createSlice({
  name: 'motoReturnLeader',
  initialState,
  reducers: {
    resetMotoReturnLeader(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchReturnLeaderHandovers.pending, (state) => {
        state.handoversError = null;
        if (state.handoversStatus !== 'succeeded') state.handoversStatus = 'loading';
      })
      .addCase(fetchReturnLeaderHandovers.fulfilled, (state, action) => {
        state.handoversStatus = 'succeeded';
        state.handovers = action.payload;
      })
      .addCase(fetchReturnLeaderHandovers.rejected, (state, action) => {
        state.handoversStatus = 'failed';
        state.handoversError = action.error.message || 'Failed to load return-to-leader handovers';
        state.handovers = [];
      })
      .addCase(fetchClientReturnStockHolds.pending, (state) => {
        state.holdsError = null;
        if (state.holdsStatus !== 'succeeded') state.holdsStatus = 'loading';
      })
      .addCase(fetchClientReturnStockHolds.fulfilled, (state, action) => {
        state.holdsStatus = 'succeeded';
        state.holdsByHolderId[action.payload.holderId] = action.payload.holds;
      })
      .addCase(fetchClientReturnStockHolds.rejected, (state, action) => {
        state.holdsStatus = 'failed';
        state.holdsError = action.error.message || 'Failed to load returned stock holds';
      })
      .addCase(createReturnLeaderHandover.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(createReturnLeaderHandover.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(createReturnLeaderHandover.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to create return to leader';
      })
      .addCase(approveReturnLeaderHandover.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(approveReturnLeaderHandover.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(approveReturnLeaderHandover.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to approve return to leader';
      })
      .addCase(rejectReturnLeaderHandover.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(rejectReturnLeaderHandover.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(rejectReturnLeaderHandover.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to reject return to leader';
      });
  },
});

export const { resetMotoReturnLeader } = motoReturnLeaderSlice.actions;
export const motoReturnLeaderReducer = motoReturnLeaderSlice.reducer;
