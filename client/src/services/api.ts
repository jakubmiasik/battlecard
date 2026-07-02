import { msalInstance, loginRequest } from '../authConfig';

async function getToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) throw new Error('Not logged in');

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.accessToken;
  } catch {
    const response = await msalInstance.acquireTokenPopup(loginRequest);
    return response.accessToken;
  }
}

async function fetchApi(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Auth
export const authApi = {
  login: () => fetchApi('/api/auth/login', { method: 'POST' }),
  me: () => fetchApi('/api/auth/me'),
};

// Users
export const usersApi = {
  list: () => fetchApi('/api/users'),
  updateRole: (id: number, role: string) =>
    fetchApi(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  delete: (id: number) => fetchApi(`/api/users/${id}`, { method: 'DELETE' }),
};

// Technologies
export const technologiesApi = {
  list: () => fetchApi('/api/technologies'),
  create: (data: { name: string; description?: string }) =>
    fetchApi('/api/technologies', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name: string; description?: string }) =>
    fetchApi(`/api/technologies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => fetchApi(`/api/technologies/${id}`, { method: 'DELETE' }),
};

// Criteria
export const criteriaApi = {
  list: () => fetchApi('/api/criteria'),
};

// Reference Answers
export const referenceAnswersApi = {
  get: (technologyId: number) => fetchApi(`/api/reference-answers/${technologyId}`),
  save: (technologyId: number, answers: { criteriaId: number; score: number; justification: string }[]) =>
    fetchApi(`/api/reference-answers/${technologyId}`, { method: 'POST', body: JSON.stringify({ answers }) }),
};

// Comparisons
export const comparisonsApi = {
  list: () => fetchApi('/api/comparisons'),
  get: (id: number) => fetchApi(`/api/comparisons/${id}`),
  create: (data: { clientName: string; useCaseDescription?: string; technologyIds: number[]; categoryWeights?: { categoryId: number; weight: number }[] }) =>
    fetchApi('/api/comparisons', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { clientName: string; useCaseDescription?: string; status?: string }) =>
    fetchApi(`/api/comparisons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  saveScores: (id: number, scores: { technologyId: number; criteriaId: number; score: number; justification?: string }[]) =>
    fetchApi(`/api/comparisons/${id}/scores`, { method: 'PUT', body: JSON.stringify({ scores }) }),
  saveWeights: (id: number, weights: { categoryId: number; weight: number }[]) =>
    fetchApi(`/api/comparisons/${id}/weights`, { method: 'PUT', body: JSON.stringify({ weights }) }),
  getResults: (id: number) => fetchApi(`/api/comparisons/${id}/results`),
  delete: (id: number) => fetchApi(`/api/comparisons/${id}`, { method: 'DELETE' }),
};
