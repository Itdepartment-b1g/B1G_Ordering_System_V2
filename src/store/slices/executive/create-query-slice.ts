import {
  createAsyncThunk,
  createSlice,
  type ActionCreatorWithoutPayload,
  type AsyncThunk,
} from "@reduxjs/toolkit";

export type QueryStatus = "idle" | "loading" | "succeeded" | "failed";

export type QueryState<TData, TArgs = unknown> = {
  data: TData;
  status: QueryStatus;
  error: string | null;
  lastArgs: TArgs | null;
};

export function createExecutiveQuerySlice<TData, TArgs = Record<string, never>>(config: {
  name: string;
  emptyData: TData;
  fetch: (args: TArgs) => Promise<TData>;
}) {
  const fetchThunk = createAsyncThunk<TData, TArgs>(`${config.name}/fetch`, (args) => config.fetch(args));

  const refetchLastThunk = createAsyncThunk(
    `${config.name}/refetchLast`,
    async (_: void, { getState, dispatch }) => {
      const lastArgs =
        (getState() as Record<string, QueryState<TData, TArgs> | undefined>)[config.name]?.lastArgs ??
        null;
      if (lastArgs == null) return config.emptyData;
      return dispatch(fetchThunk(lastArgs as any)).unwrap();
    }
  );

  const initialState: QueryState<TData, TArgs> = {
    data: config.emptyData,
    status: "idle",
    error: null,
    lastArgs: null,
  };

  const slice = createSlice({
    name: config.name,
    initialState,
    reducers: {
      reset(state) {
        const next = state as QueryState<TData, TArgs>;
        next.data = config.emptyData;
        next.status = "idle";
        next.error = null;
        next.lastArgs = null;
      },
    },
    extraReducers(builder) {
      builder
        .addCase(fetchThunk.pending, (state, action) => {
          const next = state as QueryState<TData, TArgs>;
          next.error = null;
          next.lastArgs = action.meta.arg;
          if (next.status !== "succeeded") next.status = "loading";
        })
        .addCase(fetchThunk.fulfilled, (state, action) => {
          const next = state as QueryState<TData, TArgs>;
          next.status = "succeeded";
          next.data = action.payload;
          next.lastArgs = action.meta.arg;
        })
        .addCase(fetchThunk.rejected, (state, action) => {
          const next = state as QueryState<TData, TArgs>;
          next.status = "failed";
          next.error = action.error.message || `Failed to load ${config.name}`;
        });
    },
  });

  return {
    name: config.name,
    reducer: slice.reducer,
    fetch: fetchThunk as AsyncThunk<TData, TArgs, any>,
    refetchLast: refetchLastThunk,
    reset: slice.actions.reset as ActionCreatorWithoutPayload,
  };
}
