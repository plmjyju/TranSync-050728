# 客户端预报单 API 使用指南

## 概述

客户端只能**查看**包含自己包裹的预报单信息，**无权修改**预报单或 MAWB 信息。这确保了数据安全和权限隔离。

## API 端点

### 1. 获取包含客户包裹的预报单列表

```http
GET /api/client/forecasts
```

**查询参数:**

- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 20)
- `status`: 预报单状态筛选
- `mawb`: MAWB 号模糊搜索
- `flight_no`: 航班号模糊搜索

**响应:**

```json
{
  "forecasts": [
    {
      "id": 1,
      "forecast_code": "IB0A001-250801A",
      "mawb": "784-12345678",
      "flight_no": "CA123",
      "departure_port": "PEK",
      "destination_port": "LAX",
      "status": "confirmed",
      "creator": {
        "username": "代理商A",
        "company_name": "物流公司"
      },
      "packages": [
        {
          "id": 101,
          "package_code": "PKG001",
          "weight_kg": "10.50",
          "status": "prepared",
          "tracking_no": "1Z12345E1234567890",
          "mawb": "784-12345678",
          "hawb": "HAWB123456"
        }
      ]
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

**特点:**

- 只返回包含该客户包裹的预报单
- 每个预报单只显示属于该客户的包裹
- 支持分页和筛选

### 2. 获取预报单详情

```http
GET /api/client/forecasts/:id
```

**查询参数:**

- `page`: 包裹列表页码 (默认: 1)
- `limit`: 每页包裹数量 (默认: 50)

**响应:**

```json
{
  "forecast": {
    "id": 1,
    "forecast_code": "IB0A001-250801A",
    "mawb": "784-12345678",
    "flight_no": "CA123",
    "departure_port": "PEK",
    "destination_port": "LAX",
    "etd": "2025-08-01T10:00:00Z",
    "eta": "2025-08-01T22:00:00Z",
    "status": "confirmed",
    "created_at": "2025-07-31T08:00:00Z",
    "creator": {
      "username": "代理商A",
      "company_name": "物流公司"
    },
    "client_package_count": 3,
    "total_package_count": 15
  },
  "packages": [
    {
      "id": 101,
      "package_code": "PKG001",
      "weight_kg": "10.50",
      "status": "prepared",
      "tracking_no": "1Z12345E1234567890",
      "mawb": "784-12345678",
      "hawb": "HAWB123456",
      "created_at": "2025-07-31T09:00:00Z",
      "pallet": {
        "id": 5,
        "pallet_code": "PMC001",
        "pallet_type": "PMC",
        "location_code": "W2-R12-A1"
      }
    }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

**特点:**

- 显示预报单基本信息（只读）
- 只显示属于该客户的包裹
- 显示包裹的板信息（如果已装板）
- 区分客户包裹数量和总包裹数量

### 3. 获取包裹统计信息

```http
GET /api/client/forecasts/stats
```

**响应:**

```json
{
  "by_forecast_status": [
    {
      "forecast_status": "confirmed",
      "package_count": "8",
      "total_weight": "85.50"
    },
    {
      "forecast_status": "arrived",
      "package_count": "12",
      "total_weight": "120.30"
    }
  ],
  "by_package_status": [
    {
      "status": "prepared",
      "count": "15",
      "total_weight": "155.20"
    },
    {
      "status": "stored",
      "count": "5",
      "total_weight": "50.60"
    }
  ],
  "total": {
    "total_packages": "20",
    "total_weight": "205.80",
    "forecast_count": "3"
  }
}
```

**特点:**

- 按预报单状态统计客户的包裹
- 按包裹状态统计
- 总体统计信息

## 权限说明

### ✅ 客户端可以做的:

1. **查看预报单列表** - 仅显示包含自己包裹的预报单
2. **查看预报单详情** - 仅显示自己的包裹信息
3. **搜索和筛选** - 按状态、MAWB、航班号等筛选
4. **查看统计信息** - 自己包裹的各种统计数据
5. **分页浏览** - 支持分页查看大量数据

### ❌ 客户端不能做的:

1. **创建预报单** - 预报单由货代或运营创建
2. **修改预报单信息** - 不能修改 MAWB、航班信息等
3. **修改包裹信息** - 不能修改包裹状态、重量等
4. **查看其他客户的包裹** - 数据隔离，只能看自己的
5. **删除任何信息** - 只有查看权限

## 前端集成示例

### 预报单列表页面

```javascript
const ForecastList = () => {
  const [forecasts, setForecasts] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({
    status: "",
    mawb: "",
    flight_no: "",
  });

  const fetchForecasts = async (page = 1) => {
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...filters,
      });

      const response = await api.get(`/client/forecasts?${params}`);
      setForecasts(response.data.forecasts);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error("获取预报单列表失败");
    }
  };

  return (
    <div className="forecast-list">
      {/* 搜索筛选器 */}
      <SearchFilters filters={filters} onChange={setFilters} />

      {/* 预报单列表 */}
      {forecasts.map((forecast) => (
        <ForecastCard
          key={forecast.id}
          forecast={forecast}
          showMyPackagesOnly={true}
        />
      ))}

      {/* 分页器 */}
      <Pagination pagination={pagination} onPageChange={fetchForecasts} />
    </div>
  );
};
```

### 预报单详情页面

```javascript
const ForecastDetail = ({ forecastId }) => {
  const [forecast, setForecast] = useState(null);
  const [packages, setPackages] = useState([]);

  const fetchForecastDetail = async () => {
    try {
      const response = await api.get(`/client/forecasts/${forecastId}`);
      setForecast(response.data.forecast);
      setPackages(response.data.packages);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error("您在此预报单中没有包裹");
      } else {
        toast.error("获取预报单详情失败");
      }
    }
  };

  return (
    <div className="forecast-detail">
      {/* 预报单信息 - 只读显示 */}
      <ForecastInfo forecast={forecast} readonly={true} />

      {/* 包裹统计 */}
      <div className="package-stats">
        <span>您的包裹: {forecast?.client_package_count}</span>
        <span>总包裹数: {forecast?.total_package_count}</span>
      </div>

      {/* 包裹列表 - 只显示客户自己的包裹 */}
      <PackageList packages={packages} readonly={true} />
    </div>
  );
};
```

## 错误处理

### 常见错误码

- `403` - 您在此预报单中没有包裹
- `404` - 预报单不存在
- `500` - 服务器错误

### 错误处理示例

```javascript
const handleApiError = (error) => {
  switch (error.response?.status) {
    case 403:
      toast.warning("您在此预报单中没有包裹");
      break;
    case 404:
      toast.error("预报单不存在");
      break;
    default:
      toast.error("操作失败，请稍后重试");
  }
};
```

这样的设计确保了客户端用户只能查看与自己相关的数据，同时保持了良好的用户体验。
