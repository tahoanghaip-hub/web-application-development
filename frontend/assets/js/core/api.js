export async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch('/api/v1' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-NovelStudio': '1' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
  } catch {
    throw new Error('Mất kết nối máy chủ. Hãy thử lại khi có mạng.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    const error = new Error(result?.detail || 'Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại.');
    error.status = response.status;
    if (response.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw error;
  }
  return result;
}

export const $ = id => document.getElementById(id);

export function notify(text, icon = 'success') {
  return Swal.fire({ text, icon, toast: true, position: 'top-end', timer: 3500, showConfirmButton: false });
}

export function report(error) {
  notify(error.message, 'error');
}

export function on(element, event, action) {
  element?.addEventListener(event, async e => {
    try {
      await action(e);
    } catch (error) {
      report(error);
    }
  });
}
