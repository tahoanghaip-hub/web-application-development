export function validateNovelData(data) {
  const errors = {};

  // 1. Kiểm tra Tiêu đề
  const title = (data.title || '').trim();
  if (!title) {
    errors.title = 'Tiêu đề tác phẩm không được để trống.';
  } else if (title.length < 3) {
    errors.title = 'Tiêu đề tác phẩm phải có ít nhất 3 ký tự.';
  } else if (title.length > 150) {
    errors.title = 'Tiêu đề tác phẩm không được vượt quá 150 ký tự.';
  }

  // 2. Kiểm tra Mô tả
  const description = (data.description || '').trim();
  if (!description) {
    errors.description = 'Mô tả cốt truyện không được để trống.';
  } else if (description.length < 10) {
    errors.description = `Mô tả cốt truyện tối thiểu 10 ký tự (hiện có ${description.length} ký tự).`;
  }

  // 3. Kiểm tra Deadline (Không được nhỏ hơn ngày hôm nay)
  const deadlineStr = (data.deadline || '').trim();
  if (!deadlineStr) {
    errors.deadline = 'Vui lòng chọn thời hạn hoàn thành (Deadline).';
  } else {
    const deadlineDate = new Date(deadlineStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);

    if (isNaN(deadlineDate.getTime())) {
      errors.deadline = 'Định dạng ngày không hợp lệ (YYYY-MM-DD).';
    } else if (!data.id && deadlineDate < today) {
      errors.deadline = 'Thời hạn hoàn thành không được nhỏ hơn ngày hiện tại.';
    }
  }

  // 4. Kiểm tra Mức độ ưu tiên
  const validPriorities = ['Low', 'Medium', 'High'];
  if (!data.priority || !validPriorities.includes(data.priority)) {
    errors.priority = 'Mức độ ưu tiên phải là Low, Medium hoặc High.';
  }

  // 5. Kiểm tra Trạng thái
  const validStatuses = ['Pending', 'Done'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.status = 'Trạng thái tác phẩm phải là Pending hoặc Done.';
  }

  return errors;
}
