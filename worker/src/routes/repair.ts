import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import {
  connectRepair,
  decodeImageBase64,
  formatChinaDate,
  isChoiceField,
  isDateField,
  isUploadField,
  parseDateToTimestamp,
  REPAIR_CATALOGS,
  resolveRepairCatalog,
  type RepairClient,
  type RepairForm,
  type RepairImage,
  type RepairOrder,
} from '../school/hunau/bxpt';

const DEFAULT_TIME_LOOKUP = '3965f192-b6ed-11eb-8b80-af0eafc5dd38';

async function collectSubmitValues(
  client: RepairClient,
  form: RepairForm,
  options: {
    location: string;
    description: string;
    title: string;
    phone: string;
    appointmentDate: string;
    appointmentTime: string;
    uploadedCount: number;
  },
): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};

  for (const field of form.fields) {
    if (field.hidden || field.readonly) continue;

    // 附件字段：传已上传的张数
    if (isUploadField(field)) {
      values[field.name] = options.uploadedCount;
      continue;
    }

    // 预约日期
    if (isDateField(field) || field.name === 'yyrq') {
      values[field.name] =
        parseDateToTimestamp(options.appointmentDate) ?? options.appointmentDate;
      continue;
    }

    // 预约时间段
    if (field.name === 'yywxsj') {
      if (options.appointmentTime !== '') {
        values[field.name] = options.appointmentTime;
      } else {
        const choices = await client.lookup(field.referenceType ?? DEFAULT_TIME_LOOKUP);
        values[field.name] = choices.length > 0 ? choices[0].id : '14_15';
      }
      continue;
    }

    // 手机号
    if (field.name === 'sjhm' || field.label.includes('手机') || field.label.includes('电话')) {
      values[field.name] =
        options.phone !== ''
          ? options.phone
          : (form.initialValues[field.name] ?? client.account.username);
      continue;
    }

    // 姓名
    if (field.name === 'xm' || field.label.includes('姓名')) {
      values[field.name] = form.initialValues[field.name] ?? client.account.realName;
      continue;
    }

    // 详细位置 / 房间号
    if (
      field.name === 'xxwzhfjy' ||
      field.label.includes('详细位置') ||
      field.label.includes('房间号')
    ) {
      values[field.name] = options.location !== '' ? options.location : options.description;
      continue;
    }

    // 问题描述 / 补充说明
    if (
      field.name === 'wtmsh' ||
      field.name === 'bchshm' ||
      field.label.includes('问题描述') ||
      field.label.includes('补充说明')
    ) {
      values[field.name] = options.description;
      continue;
    }

    // 工单标题
    if (field.name === 'title' || field.label.includes('标题')) {
      values[field.name] = options.title;
      continue;
    }

    // 其余选择器：按地点/描述关键词尽量匹配
    if (isChoiceField(field)) {
      try {
        const choices = await client.choicesForField(field);
        if (choices.length > 0) {
          const searchContext = `${options.location} ${options.description}`;
          const matched = choices.find(
            (choice) =>
              searchContext.includes(choice.label) || choice.label.includes(options.location),
          );
          values[field.name] = (matched ?? choices[0]).id;
        }
      } catch {}
    }
  }

  return values;
}

function formatOrder(order: RepairOrder): Record<string, unknown> {
  return {
    id: order.id,
    code: order.code,
    title: order.title,
    catalog: order.catalog,
    department: order.department,
    status: order.status,
    createdAt: order.createdAtMs === null ? null : formatChinaDate(order.createdAtMs),
    description: order.description,
  };
}

/**
 * 查询报修工单列表
 * GET /api/campus/repair/orders?ongoing=true&page=1&size=20
 */
export async function handleRepairOrders(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const ongoing = url.searchParams.get('ongoing') !== 'false';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const size = Math.min(50, Math.max(1, parseInt(url.searchParams.get('size') || '20', 10) || 20));

  try {
    const orders = await runWithSession(env, creds, async (context) => {
      const client = await connectRepair(context.session, context.identity || { username: creds.oaId });
      return await client.fetchOrders({
        ongoing,
        pageIndex: page,
        pageSize: size,
      });
    });

    return ok(orders.map(formatOrder));
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取报修工单失败', 500);
  }
}

/**
 * 查询报修分类
 * GET /api/campus/repair/catalogs
 */
export async function handleRepairCatalogs(): Promise<Response> {
  return ok(REPAIR_CATALOGS);
}

/**
 * 查询单条工单详情
 * GET /api/campus/repair/orders/detail?id=...
 */
export async function handleRepairDetail(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const orderId = url.searchParams.get('id') || '';
  if (!orderId) return fail('缺少 orderId', 400);

  try {
    const detail = await runWithSession(env, creds, async (context) => {
      const client = await connectRepair(context.session, context.identity || { username: creds.oaId });
      return await client.fetchOrderDetailById(orderId);
    });

    return ok(detail);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取工单详情失败', 500);
  }
}

/**
 * 取消工单
 * POST /api/campus/repair/cancel
 * Body: { orderId, reason? }
 */
export async function handleRepairCancel(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '用户申请取消';
  if (!orderId) return fail('缺少 orderId', 400);

  try {
    await runWithSession(env, creds, async (context) => {
      const client = await connectRepair(context.session, context.identity || { username: creds.oaId });
      const order = await client.fetchOrderDetailById(orderId);
      await client.cancelOrder(order);
    });

    return ok({ message: '工单已成功取消' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '取消工单失败', 500);
  }
}

/**
 * 提交报修工单
 * POST /api/campus/repair/submit
 * Body: { catalog?, title?, description, location?, phone?, appointmentDate?, appointmentTime?, imageBase64?, imageName? }
 */
export async function handleRepairSubmit(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const catalogInput = typeof body.catalog === 'string' ? body.catalog.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const appointmentDate = typeof body.appointmentDate === 'string' ? body.appointmentDate.trim() : '';
  const appointmentTime = typeof body.appointmentTime === 'string' ? body.appointmentTime.trim() : '';
  const userTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const imageName = typeof body.imageName === 'string' ? body.imageName.trim() : `repair-${Date.now()}.jpg`;

  if (!description) {
    return fail('请填写问题描述', 400);
  }

  const catalog = resolveRepairCatalog(catalogInput || '后勤报修');
  const isLogistics = catalog.title.includes('后勤');

  if (isLogistics && !imageBase64) {
    return fail('后勤报修平台严格要求上传现场故障照片，请选择或拍照后重试', 400);
  }

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const client = await connectRepair(
        context.session,
        context.identity || { username: creds.oaId },
      );
      const realName = context.identity?.realName ?? '';
      const resolvedTitle =
        userTitle || `${realName ? realName : '用户'}的${catalog.title}`;
      const resolvedDate =
        appointmentDate === '' ? formatChinaDate(Date.now()) : appointmentDate.replace(/-/g, '/');

      const form = await client.loadForm(catalog);

      let uploadedCount = 0;
      if (imageBase64) {
        const uploadField = form.fields.find((field) => isUploadField(field));
        if (uploadField) {
          const img = decodeImageBase64(imageBase64, imageName);
          await client.uploadAttachment(form, uploadField.name, img);
          uploadedCount = 1;
        }
      }

      const values = await collectSubmitValues(client, form, {
        location,
        description,
        title: resolvedTitle,
        phone,
        appointmentDate: resolvedDate,
        appointmentTime,
        uploadedCount,
      });

      await client.submit(form, values, false);

      return {
        success: true,
        catalog: catalog.title,
        title: resolvedTitle,
        instanceId: form.instanceId,
        message: '报修工单已成功提交！',
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '提交报修工单失败', 500);
  }
}
