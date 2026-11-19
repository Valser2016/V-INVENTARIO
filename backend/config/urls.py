"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle

from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)

from django.http import JsonResponse


def health_check(request):
    return JsonResponse({"status": "ok"})


class LoginThrottleTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = "login"


urlpatterns = [

    path(
        "api/usuarios/",
        include("apps.usuarios.urls"),
    ),

    path(
        "api/reportes/",
        include("apps.reportes.urls"),
    ),

    path(
        "admin/",
        admin.site.urls
    ),

    path("health/", health_check, name="health-check"),

    path(
        "api/levantamiento/",
        include("apps.levantamiento.urls"),
    ),

    path(
        "api/movimientos/",
        include("apps.movimientos.urls"),
    ),

    path(
        "api/auth/token/",
        LoginThrottleTokenObtainPairView.as_view(),
        name="token_obtain_pair",
    ),

    path(
        "api/auth/token/refresh/",
        TokenRefreshView.as_view(),
        name="token_refresh",
    ),

    path(
        "api/auth/token/blacklist/",
        TokenBlacklistView.as_view(),
        name="token_blacklist",
    ),
]