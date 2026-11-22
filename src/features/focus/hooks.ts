import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FocusSession } from "@/types/domain";

import {
  completeFocusSession,
  getActiveFocusSession,
  listFocusSessionsBetween,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  type StartFocusInput,
} from "./api";
import { focus } from "./queryKeys";

export function useActiveFocusSession() {
  return useQuery({
    queryKey: focus.active,
    queryFn: getActiveFocusSession,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

function setActive(queryClient: ReturnType<typeof useQueryClient>, value: FocusSession | null) {
  queryClient.setQueryData<FocusSession | null>(focus.active, value);
}

function refetchActive(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: focus.active });
}

export function useStartFocusSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartFocusInput) => startFocusSession(input),
    onSuccess: (session) => {
      setActive(queryClient, session);
      void queryClient.invalidateQueries({ queryKey: focus.all });
    },
    onError: () => refetchActive(queryClient),
  });
}

export function usePauseFocusSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pauseFocusSession(id),
    onSuccess: (session) => setActive(queryClient, session),
    onError: () => refetchActive(queryClient),
  });
}

export function useResumeFocusSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resumeFocusSession(id),
    onSuccess: (session) => setActive(queryClient, session),
    onError: () => refetchActive(queryClient),
  });
}

export function useCompleteFocusSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeFocusSession(id),
    onSuccess: () => {
      setActive(queryClient, null);
      void queryClient.invalidateQueries({ queryKey: focus.all });
    },
    onError: () => refetchActive(queryClient),
  });
}

export function useFocusSessionsBetween(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: focus.range(fromIso, toIso),
    queryFn: () => listFocusSessionsBetween(fromIso, toIso),
    staleTime: 60_000,
  });
}
