import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "@/store/store";
import type { QueryState } from "./create-query-slice";

export function useSliceQuery<TData, TArgs>(
  typeHint: TData,
  selector: (state: any) => QueryState<TData, TArgs>,
  fetchAction: (args: TArgs) => any,
  resetAction: (...args: any[]) => any,
  getArgs: () => TArgs,
  enabled: boolean,
  deps: unknown[]
) {
  const dispatch = useDispatch<AppDispatch>();
  const { data = typeHint, status, error } = useSelector(selector) as QueryState<TData, TArgs>;

  useEffect(() => {
    if (!enabled) {
      dispatch(resetAction());
      return;
    }
    void dispatch(fetchAction(getArgs()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, enabled, ...deps]);

  const refetch = useCallback(() => {
    if (!enabled) {
      dispatch(resetAction());
      return Promise.resolve(typeHint);
    }
    return dispatch(fetchAction(getArgs())).unwrap() as Promise<TData>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, enabled, ...deps]);

  return {
    data,
    isLoading: status === "loading" || (status === "idle" && enabled),
    error,
    refetch,
  };
}
